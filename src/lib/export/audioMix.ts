// Mixes every audible clip into one stereo buffer with OfflineAudioContext.
// Runs on the main thread because neither OfflineAudioContext nor AudioBuffer
// exist in workers; the heavy lifting (decode, resample, mix) is still done by
// the browser off the JS thread.

import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import type { MediaClip, Project } from "../types";
import { clipEnd } from "../types";

export const MIX_SAMPLE_RATE = 48000;

export interface MixedAudio {
  sampleRate: number;
  channels: Float32Array[];
}

export class ExportCancelled extends Error {
  constructor() {
    super("Export cancelled");
  }
}

export function audibleClips(project: Project): MediaClip[] {
  const media = new Map(project.media.map((m) => [m.id, m]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  return project.clips.filter(
    (c): c is MediaClip =>
      c.type === "media" &&
      !c.muted &&
      c.volume > 0 &&
      !tracks.get(c.trackId)?.muted &&
      tracks.get(c.trackId)?.kind !== "text" &&
      !!media.get(c.mediaId)?.hasAudio,
  );
}

/** Returns null when nothing on the timeline is audible. */
export async function mixAudio(
  project: Project,
  duration: number,
  getBlob: (mediaId: string) => Blob | undefined,
  onProgress: (fraction: number) => void,
  isCancelled: () => boolean,
): Promise<MixedAudio | null> {
  const clips = audibleClips(project);
  if (!clips.length) return null;

  const length = Math.max(1, Math.ceil(duration * MIX_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, MIX_SAMPLE_RATE);

  for (let i = 0; i < clips.length; i++) {
    if (isCancelled()) throw new ExportCancelled();
    const clip = clips[i];
    const blob = getBlob(clip.mediaId);
    if (!blob) throw new Error("A media file used on the timeline is missing. Re-import it and try again.");
    const buffer = await decodeRange(blob, clip.in, clip.in + clip.duration, isCancelled);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = clip.volume;
      src.connect(gain).connect(ctx.destination);
      src.start(clip.start);
      src.stop(clipEnd(clip));
    }
    onProgress((i + 1) / (clips.length + 1));
  }

  if (isCancelled()) throw new ExportCancelled();
  const rendered = await ctx.startRendering();
  onProgress(1);
  return {
    sampleRate: rendered.sampleRate,
    channels: [rendered.getChannelData(0), rendered.getChannelData(1)],
  };
}

/**
 * Decodes [from, to) of a file's primary audio track into a single AudioBuffer
 * aligned so that sample 0 corresponds to `from`. Decoding only the used range
 * keeps memory proportional to the clip, not the source file.
 */
async function decodeRange(blob: Blob, from: number, to: number, isCancelled: () => boolean): Promise<AudioBuffer | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const sink = new AudioBufferSink(track);
    let out: AudioBuffer | null = null;
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      if (isCancelled()) throw new ExportCancelled();
      if (!out) {
        const len = Math.max(1, Math.ceil((to - from) * buffer.sampleRate));
        out = new AudioBuffer({ length: len, numberOfChannels: Math.min(2, buffer.numberOfChannels), sampleRate: buffer.sampleRate });
      }
      // Position of this chunk relative to `from`; the first chunk may start earlier.
      const offset = Math.round((timestamp - from) * buffer.sampleRate);
      const skip = Math.max(0, -offset);
      const dst = Math.max(0, offset);
      const n = Math.min(buffer.length - skip, out.length - dst);
      if (n <= 0) continue;
      for (let ch = 0; ch < out.numberOfChannels; ch++) {
        // Mono sources feed both channels.
        const srcData = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
        out.copyToChannel(srcData.subarray(skip, skip + n), ch, dst);
      }
    }
    return out;
  } finally {
    input.dispose();
  }
}
