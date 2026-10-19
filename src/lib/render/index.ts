// The shared frame renderer. Preview (main thread, <video> elements) and export
// (worker, WebCodecs-decoded frames) both call renderFrame with the same project
// data; only the frame source differs. Keep this module free of DOM-only APIs so
// it runs on an OffscreenCanvas inside a worker.

import type { Clip, MediaClip, Project, TextClip, Track } from "../types";
import { clipEnd } from "../types";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface VisualFrame {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** Returns the frame to draw for a media clip at the given source time, or null if not ready. */
export type FrameProvider = (clip: MediaClip, sourceTime: number) => VisualFrame | null;

export function isActiveAt(c: Clip, t: number): boolean {
  return t >= c.start && t < clipEnd(c);
}

export function sourceTimeAt(c: MediaClip, t: number): number {
  return c.in + (t - c.start);
}

/**
 * Visible clips at time t, ordered bottom layer first. Tracks higher in the list
 * are drawn later (on top); audio tracks never draw.
 */
export function visibleClipsAt(project: Project, t: number): Clip[] {
  const out: Clip[] = [];
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track: Track = project.tracks[i];
    if (track.kind === "audio") continue;
    for (const c of project.clips) {
      if (c.trackId === track.id && isActiveAt(c, t)) out.push(c);
    }
  }
  return out;
}

export function projectDuration(project: Project): number {
  let d = 0;
  for (const c of project.clips) d = Math.max(d, clipEnd(c));
  return d;
}

export interface TextLayout {
  lines: string[];
  fontPx: number;
  lineHeight: number;
  /** Bounding box in canvas pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
}

export function textFont(clip: TextClip, H: number): string {
  return `700 ${Math.max(1, Math.round(clip.size * (H / 1080)))}px ${clip.font}`;
}

export function layoutText(ctx: Ctx2D, clip: TextClip, W: number, H: number): TextLayout {
  const fontPx = Math.max(1, Math.round(clip.size * (H / 1080)));
  const font = textFont(clip, H);
  ctx.font = font;
  const lines = (clip.text || " ").split("\n");
  const lineHeight = fontPx * 1.2;
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const h = lineHeight * lines.length;
  return {
    lines,
    fontPx,
    lineHeight,
    x: clip.x * W - w / 2,
    y: clip.y * H - h / 2,
    w,
    h,
    font,
  };
}

function drawText(ctx: Ctx2D, clip: TextClip, W: number, H: number) {
  const L = layoutText(ctx, clip, W, H);
  ctx.save();
  ctx.font = L.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = clip.color;
  // A soft shadow keeps text readable on any footage.
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = L.fontPx * 0.15;
  ctx.shadowOffsetY = L.fontPx * 0.04;
  const cx = clip.x * W;
  L.lines.forEach((line, i) => {
    ctx.fillText(line, cx, L.y + L.lineHeight * (i + 0.5));
  });
  ctx.restore();
}

/** Fit a source rectangle inside the frame, preserving aspect ratio (letterbox). */
export function containRect(sw: number, sh: number, W: number, H: number) {
  const s = Math.min(W / sw, H / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** Draws the composited frame for time t into ctx (size W x H). Pure w.r.t. project + t. */
export function renderFrame(
  ctx: Ctx2D,
  project: Project,
  t: number,
  W: number,
  H: number,
  getFrame: FrameProvider,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  for (const c of visibleClipsAt(project, t)) {
    if (c.type === "text") {
      drawText(ctx, c, W, H);
      continue;
    }
    const f = getFrame(c, sourceTimeAt(c, t));
    if (!f || !f.width || !f.height) continue;
    const r = containRect(f.width, f.height, W, H);
    ctx.drawImage(f.image, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}
