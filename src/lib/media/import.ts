// Probing and validating imported files. Everything is checked up front so a
// file that would fail later in preview or export is rejected with a reason.

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import type { MediaAsset, MediaKind } from "../types";
import { uid } from "../id";
import { formatBytes } from "../time";

export class ImportError extends Error {}

export interface ProbeResult {
  asset: MediaAsset;
  warnings: string[];
}

const LARGE_FILE = 1.5 * 1024 ** 3;

const EXT_KIND: Record<string, MediaKind> = {
  mp4: "video", m4v: "video", mov: "video", webm: "video", mkv: "video", ogv: "video",
  mp3: "audio", m4a: "audio", aac: "audio", wav: "audio", ogg: "audio", oga: "audio",
  opus: "audio", flac: "audio",
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", bmp: "image",
  avif: "image",
};

function extOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function detectKind(file: File): MediaKind | null {
  const ext = extOf(file.name);
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/") && !/hei[cf]/.test(file.type)) return "image";
  return null;
}

export async function probeFile(file: File): Promise<ProbeResult> {
  const ext = extOf(file.name);
  if (ext === "heic" || ext === "heif") {
    throw new ImportError(
      "HEIC photos aren't supported by browsers. Export the photo as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible).",
    );
  }
  const kind = detectKind(file);
  if (!kind) throw new ImportError(`Unsupported file type “.${ext || "?"}”. Use MP4/MOV/WebM, MP3/WAV/M4A, or JPG/PNG/WebP.`);
  if (file.size === 0) throw new ImportError("The file is empty.");

  const warnings: string[] = [];
  if (file.size > LARGE_FILE) {
    warnings.push(
      `${file.name} is large (${formatBytes(file.size)}). Editing will work, but saving it with the project may exceed browser storage.`,
    );
  }

  const base = {
    id: uid("m_"),
    name: file.name,
    kind,
    mime: file.type || `application/${ext}`,
    size: file.size,
  };

  if (kind === "image") {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new ImportError("This image couldn't be decoded. Try converting it to JPEG or PNG.");
    }
    const thumbnail = thumbFrom(bmp, bmp.width, bmp.height);
    const asset: MediaAsset = {
      ...base,
      duration: Infinity,
      width: bmp.width,
      height: bmp.height,
      hasAudio: false,
      thumbnail,
    };
    bmp.close();
    return { asset, warnings };
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead().catch(() => false))) {
      throw new ImportError("This file's container format isn't supported or the file is damaged.");
    }
    const vt = kind === "video" ? await input.getPrimaryVideoTrack() : null;
    const at = await input.getPrimaryAudioTrack();

    if (kind === "video" && !vt) {
      if (!at) throw new ImportError("This file has no video or audio track.");
      warnings.push(`${file.name} has no video track; it was imported as audio.`);
    }
    if (kind === "audio" && !at) throw new ImportError("This file has no audio track.");

    let width = 0;
    let height = 0;
    let thumbnail: string | undefined;
    if (vt) {
      const codec = await vt.getCodec();
      if (!(await vt.canDecode())) {
        if (codec === "hevc") {
          throw new ImportError(
            "This video is HEVC (H.265), which this browser can't decode. On iPhone set Settings → Camera → Formats → Most Compatible, or convert the file to H.264 MP4. Safari on macOS and Chrome/Edge on Windows with HEVC support can open it.",
          );
        }
        throw new ImportError(`This browser can't decode the video codec (${codec ?? "unknown"}). Convert the file to H.264 MP4.`);
      }
      width = await vt.getDisplayWidth();
      height = await vt.getDisplayHeight();
      if (await vt.hasHighDynamicRange().catch(() => false)) {
        warnings.push(`${file.name} is HDR; colours may look washed out in preview and export (SDR output).`);
      }
    }

    let hasAudio = false;
    if (at) {
      hasAudio = await at.canDecode().catch(() => false);
      if (!hasAudio) {
        const c = await at.getCodec();
        if (kind === "audio") throw new ImportError(`This browser can't decode the audio codec (${c ?? "unknown"}).`);
        warnings.push(`${file.name}: the audio track (${c ?? "unknown"}) can't be decoded, so the clip will be silent.`);
      }
    }

    let duration =
      (await input.getDurationFromMetadata().catch(() => null)) ?? (await input.computeDuration());
    if (!Number.isFinite(duration) || duration <= 0) duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new ImportError("Couldn't determine the file's duration.");

    if (vt) {
      try {
        const sink = new CanvasSink(vt, { width: 160 });
        const frame = await sink.getCanvas(Math.min(duration * 0.1, 1));
        if (frame) thumbnail = thumbFrom(frame.canvas, frame.canvas.width, frame.canvas.height);
      } catch {
        // A missing thumbnail is cosmetic.
      }
    }

    // The preview plays files through <video>/<audio>, so make sure the element can too.
    await checkElementPlayback(file, vt ? "video" : "audio");

    const asset: MediaAsset = {
      ...base,
      kind: vt ? "video" : "audio",
      duration,
      width,
      height,
      hasAudio,
      thumbnail,
    };
    return { asset, warnings };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(`Couldn't read the file: ${(e as Error).message}`);
  } finally {
    input.dispose();
  }
}

function thumbFrom(src: CanvasImageSource, w: number, h: number): string | undefined {
  const tw = 160;
  const th = Math.max(1, Math.round((h / w) * tw));
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(src, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.7);
}

function checkElementPlayback(file: File, kind: "video" | "audio"): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (err?: string) => {
      clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      if (err) reject(new ImportError(err));
      else resolve();
    };
    const timer = setTimeout(() => done(), 15000); // slow disks: don't block import
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      if (kind === "video" && (el as HTMLVideoElement).videoWidth === 0) {
        done("The browser's player can't show this video's picture (likely an unsupported codec). Convert it to H.264 MP4.");
      } else done();
    };
    el.onerror = () => done("The browser's player can't play this file. Convert it to H.264 MP4 / AAC.");
    el.src = url;
  });
}
