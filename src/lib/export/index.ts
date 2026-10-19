// Export orchestration on the main thread: capability checks, audio mix, then
// hand-off to the export worker for frame rendering and encoding.

import { canEncodeVideo, getFirstEncodableVideoCodec } from "mediabunny";
import type { Project } from "../types";
import { projectDuration } from "../render";
import { getMediaBlob } from "../media/registry";
import { ExportCancelled, audibleClips, mixAudio } from "./audioMix";
import type { ExportJob, FromWorker } from "./messages";

export { ExportCancelled };

export type ExportResolution = 720 | 1080;

export interface SupportReport {
  ok: boolean;
  problems: string[];
  notes: string[];
}

/** Checks everything export needs, returning human-readable problems instead of throwing. */
export async function checkExportSupport(project: Project, resolution: ExportResolution): Promise<SupportReport> {
  const problems: string[] = [];
  const notes: string[] = [];
  const W = Math.round((resolution * 16) / 9);

  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    problems.push(
      "This browser doesn't support WebCodecs, which export needs. Use a recent Chrome or Edge (desktop), Safari 17+, or Firefox 130+.",
    );
  }
  if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") {
    problems.push("This browser lacks OffscreenCanvas or Web Workers, which export needs.");
  }
  if (typeof OfflineAudioContext === "undefined" && audibleClips(project).length) {
    problems.push("This browser can't mix audio offline (no OfflineAudioContext).");
  }
  if (problems.length) return { ok: false, problems, notes };

  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: W, height: resolution }).catch(() => null);
  if (!codec) {
    problems.push(`This browser can't encode video at ${W}×${resolution}.${resolution === 1080 ? " Try 720p." : ""}`);
  } else if (codec !== "avc") {
    notes.push(
      `H.264 encoding isn't available here, so the MP4 will use ${codec.toUpperCase()}. It plays in browsers but may not in older players.`,
    );
  } else if (!(await canEncodeVideo("avc", { width: W, height: resolution }).catch(() => false))) {
    problems.push("H.264 encoding failed its capability check.");
  }

  if (projectDuration(project) <= 0) problems.push("The timeline is empty. Add some clips first.");

  const used = new Set(project.clips.flatMap((c) => (c.type === "media" ? [c.mediaId] : [])));
  const missing = project.media.filter((m) => used.has(m.id) && !getMediaBlob(m.id));
  if (missing.length) {
    problems.push(`Missing media files: ${missing.map((m) => m.name).join(", ")}. Re-import them before exporting.`);
  }
  if (!audibleClips(project).length && project.clips.length) notes.push("Nothing on the timeline is audible, so the file will have no audio track.");

  return { ok: problems.length === 0, problems, notes };
}

export interface ExportHandle {
  promise: Promise<Blob>;
  cancel: () => void;
}

export interface ExportProgress {
  phase: "audio" | "video" | "finishing";
  /** 0..1 over the whole export. */
  value: number;
}

const AUDIO_SHARE = 0.1;

export function startExport(
  project: Project,
  resolution: ExportResolution,
  onProgress: (p: ExportProgress) => void,
  onInfo?: (info: { videoCodec: string; audioCodec: string | null }) => void,
): ExportHandle {
  let cancelled = false;
  let worker: Worker | null = null;
  let rejectFn: ((e: Error) => void) | null = null;

  const promise = new Promise<Blob>((resolve, reject) => {
    rejectFn = reject;
    (async () => {
      const duration = projectDuration(project);
      const height = resolution;
      const width = Math.round((height * 16) / 9);

      onProgress({ phase: "audio", value: 0 });
      const audio = await mixAudio(
        project,
        duration,
        getMediaBlob,
        (f) => onProgress({ phase: "audio", value: f * AUDIO_SHARE }),
        () => cancelled,
      );
      if (cancelled) throw new ExportCancelled();

      const blobs: Record<string, Blob> = {};
      for (const c of project.clips) {
        if (c.type !== "media") continue;
        const b = getMediaBlob(c.mediaId);
        if (b) blobs[c.mediaId] = b;
      }
      const job: ExportJob = { project, blobs, width, height, fps: project.fps, duration, audio };

      worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "progress") {
          onProgress({ phase: m.value >= 1 ? "finishing" : "video", value: AUDIO_SHARE + m.value * (1 - AUDIO_SHARE) });
        } else if (m.type === "info") {
          onInfo?.({ videoCodec: m.videoCodec, audioCodec: m.audioCodec });
        } else if (m.type === "done") {
          worker?.terminate();
          resolve(new Blob([m.buffer], { type: "video/mp4" }));
        } else if (m.type === "error") {
          worker?.terminate();
          reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => {
        worker?.terminate();
        reject(new Error(e.message || "The export worker crashed."));
      };
      // Audio channel buffers are transferred, not copied.
      worker.postMessage({ type: "start", job }, audio ? audio.channels.map((c) => c.buffer as ArrayBuffer) : []);
    })().catch(reject);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      // Terminating the worker stops decoding/encoding immediately and frees its memory.
      worker?.terminate();
      rejectFn?.(new ExportCancelled());
    },
  };
}
