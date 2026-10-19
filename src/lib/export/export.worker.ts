/// <reference lib="webworker" />
// Export worker: decodes source frames with WebCodecs (via mediabunny), draws
// each output frame with the same renderFrame used by the preview, and encodes
// and muxes H.264/AAC into MP4. Running here keeps the editor UI responsive.

import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
  type WrappedCanvas,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { isActiveAt, renderFrame, sourceTimeAt, type VisualFrame } from "../render";
import type { MediaClip } from "../types";
import type { ExportJob, FromWorker, ToWorker } from "./messages";

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  if (e.data.type !== "start") return;
  run(e.data.job).catch((err: unknown) => {
    post({ type: "error", message: describe(err) });
  });
};

function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/quota|memory|allocation/i.test(msg)) return `Ran out of memory while exporting (${msg}). Try 720p or a shorter timeline.`;
  return msg || "Unknown error";
}

/** Pulls one decoded frame per output frame for a single video clip. */
interface ClipStream {
  clip: MediaClip;
  iter: AsyncGenerator<WrappedCanvas | null, void, unknown>;
}

async function run(job: ExportJob) {
  const { project, width: W, height: H, fps, duration } = job;
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: W, height: H });
  if (!videoCodec) throw new Error(`This browser can't encode video at ${W}×${H}. Try 720p or a different browser.`);

  let audioCodec: "aac" | null = null;
  if (job.audio) {
    // Some browsers (Firefox, Chromium on Linux) lack a native AAC encoder; use the WASM one there.
    if (!(await canEncodeAudio("aac"))) registerAacEncoder();
    audioCodec = "aac";
  }
  post({ type: "info", videoCodec, audioCodec });

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create a drawing surface for export (OffscreenCanvas 2D unsupported).");

  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioSampleSource | null = null;
  if (job.audio && audioCodec) {
    audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: 192_000 });
    output.addAudioTrack(audioSource);
  }

  // ---- Frame sources ------------------------------------------------------
  const mediaById = new Map(project.media.map((m) => [m.id, m]));
  const inputs = new Map<string, Input>();
  const images = new Map<string, ImageBitmap>();
  const streams: ClipStream[] = [];
  const trackKinds = new Map(project.tracks.map((t) => [t.id, t.kind]));

  for (const clip of project.clips) {
    if (clip.type !== "media" || trackKinds.get(clip.trackId) !== "video") continue;
    const media = mediaById.get(clip.mediaId);
    const blob = job.blobs[clip.mediaId];
    if (!media || !blob) throw new Error("A media file used on the timeline is missing. Re-import it and try again.");
    if (media.kind === "image") {
      if (!images.has(media.id)) images.set(media.id, await createImageBitmap(blob));
      continue;
    }
    let input = inputs.get(media.id);
    if (!input) {
      input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      inputs.set(media.id, input);
    }
    const track = await input.getPrimaryVideoTrack();
    if (!track) continue;
    if (!(await track.canDecode())) {
      throw new Error(`“${media.name}” uses a codec this browser can't decode (${(await track.getCodec()) ?? "unknown"}).`);
    }
    // Decode straight to the size it will be drawn at, which saves memory for 4K sources.
    const dw = await track.getDisplayWidth();
    const dh = await track.getDisplayHeight();
    const s = Math.min(W / dw, H / dh);
    const sink = new CanvasSink(track, {
      width: Math.max(2, Math.round(dw * s)),
      height: Math.max(2, Math.round(dh * s)),
      fit: "fill",
      poolSize: 2,
    });
    // The exact source timestamps for the output frames where this clip is visible,
    // in order. Using isActiveAt keeps this in lockstep with the main loop below.
    function* times() {
      const first = Math.max(0, Math.floor(clip.start * fps) - 1);
      for (let i = first; i < totalFrames; i++) {
        const t = i / fps;
        if (t >= clip.start + clip.duration) return;
        if (isActiveAt(clip, t)) yield sourceTimeAt(clip as MediaClip, t);
      }
    }
    streams.push({ clip, iter: sink.canvasesAtTimestamps(times()) });
  }

  await output.start();

  // ---- Audio is fed in one-second chunks interleaved with video ------------
  const audio = job.audio;
  const audioChunk = audio ? audio.sampleRate : 0;
  let audioPos = 0;
  const audioLen = audio ? audio.channels[0].length : 0;
  const feedAudioUntil = async (seconds: number) => {
    if (!audio || !audioSource) return;
    const until = Math.min(audioLen, Math.ceil(seconds * audio.sampleRate));
    while (audioPos < until) {
      const n = Math.min(audioChunk, audioLen - audioPos);
      // f32-planar: channel 0 samples followed by channel 1 samples.
      const data = new Float32Array(n * audio.channels.length);
      audio.channels.forEach((ch, i) => data.set(ch.subarray(audioPos, audioPos + n), i * n));
      const sample = new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: audio.channels.length,
        sampleRate: audio.sampleRate,
        timestamp: audioPos / audio.sampleRate,
      });
      await audioSource.add(sample);
      sample.close();
      audioPos += n;
    }
  };

  // ---- Main loop -------------------------------------------------------------
  const frames = new Map<string, VisualFrame>();
  const getFrame = (clip: MediaClip): VisualFrame | null => {
    const img = images.get(clip.mediaId);
    if (img) return { image: img, width: img.width, height: img.height };
    return frames.get(clip.id) ?? null;
  };

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    frames.clear();
    for (const s of streams) {
      if (!isActiveAt(s.clip, t)) continue;
      const r = await s.iter.next();
      const wc = r.done ? null : r.value;
      if (wc) frames.set(s.clip.id, { image: wc.canvas, width: wc.canvas.width, height: wc.canvas.height });
    }
    renderFrame(ctx, project, t, W, H, getFrame);
    await videoSource.add(t, 1 / fps);
    await feedAudioUntil(t + 1);
    if (i % 5 === 0) post({ type: "progress", value: i / totalFrames });
  }
  await feedAudioUntil(Infinity);

  videoSource.close();
  audioSource?.close();
  await output.finalize();
  for (const s of streams) await s.iter.return();
  for (const inp of inputs.values()) inp.dispose();
  for (const b of images.values()) b.close();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("The encoder produced no data.");
  post({ type: "progress", value: 1 });
  post({ type: "done", buffer, mime: await output.getMimeType().catch(() => "video/mp4") }, [buffer]);
}
