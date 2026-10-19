// Core data model. Everything here is plain, serialisable data: the editor state,
// the saved project and the renderer input are all the same shape.

export type MediaKind = "video" | "audio" | "image";

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  /** Seconds. Images have no natural duration and use Infinity. */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Small JPEG data URL for the library and timeline. */
  thumbnail?: string;
}

export type TrackKind = "video" | "audio" | "text";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
}

interface BaseClip {
  id: string;
  trackId: string;
  /** Position on the timeline, seconds. */
  start: number;
  /** Length on the timeline, seconds. */
  duration: number;
}

export interface MediaClip extends BaseClip {
  type: "media";
  mediaId: string;
  /** Offset into the source media, seconds. */
  in: number;
  /** Linear gain, 0..2. */
  volume: number;
  muted: boolean;
}

export interface TextClip extends BaseClip {
  type: "text";
  text: string;
  font: string;
  /** Font size in px relative to a 1080px-tall frame; scaled for other sizes. */
  size: number;
  color: string;
  /** Centre of the text block, normalised 0..1 of the frame. */
  x: number;
  y: number;
}

export type Clip = MediaClip | TextClip;

export interface Project {
  id: string;
  name: string;
  /** Canvas size used for layout; export scales this to 720p / 1080p. */
  width: number;
  height: number;
  fps: number;
  media: MediaAsset[];
  /** Top of the list is drawn on top. */
  tracks: Track[];
  clips: Clip[];
  createdAt: number;
  updatedAt: number;
}

export const IMAGE_DEFAULT_DURATION = 5;
export const TEXT_DEFAULT_DURATION = 3;
export const MIN_CLIP_DURATION = 0.1;

export const FONTS = [
  "Inter, Arial, sans-serif",
  "Georgia, serif",
  "'Courier New', monospace",
  "Impact, 'Arial Black', sans-serif",
  "'Trebuchet MS', sans-serif",
  "'Times New Roman', serif",
] as const;

export function clipEnd(c: { start: number; duration: number }): number {
  return c.start + c.duration;
}
