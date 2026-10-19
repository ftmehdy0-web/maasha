import type { Project } from "../types";

export interface ExportJob {
  project: Project;
  /** Only media used by visual clips; Blobs are passed by reference, not copied. */
  blobs: Record<string, Blob>;
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio: { sampleRate: number; channels: Float32Array[] } | null;
}

export type ToWorker = { type: "start"; job: ExportJob };

export type FromWorker =
  | { type: "progress"; value: number }
  | { type: "info"; videoCodec: string; audioCodec: string | null }
  | { type: "done"; buffer: ArrayBuffer; mime: string }
  | { type: "error"; message: string };
