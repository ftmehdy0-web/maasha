// Drives <video>/<audio>/image elements for the live preview. Given the project
// and the current time it makes sure every active clip has an element seeked to
// the right source position, playing or paused, at the right volume.
//
// One element per clip (not per file) so the same file can appear twice at
// once. Elements are created shortly before a clip becomes active and released
// once the playhead is far away, to stay well under browser media-player limits.

import type { MediaClip, Project } from "../types";
import { clipEnd } from "../types";
import { getMediaBlob, getMediaUrl } from "../media/registry";
import { sourceTimeAt, type VisualFrame } from "../render";

const DRIFT_TOLERANCE = 0.25; // seconds before a playing element is re-seeked
const PRELOAD_AHEAD = 1.5; // seconds: create & pre-seek upcoming clips
const RELEASE_DISTANCE = 6; // seconds: drop elements of clips this far away

interface Slot {
  el: HTMLMediaElement;
  gain?: GainNode;
  mediaId: string;
}

export class MediaPool {
  private slots = new Map<string, Slot>();
  private images = new Map<string, ImageBitmap | "loading" | "error">();
  private host: HTMLElement;
  private ctx: AudioContext | null = null;
  private onFrame: () => void;

  constructor(host: HTMLElement, onFrame: () => void) {
    this.host = host;
    this.onFrame = onFrame;
  }

  /** Must be called from a user gesture at least once so audio can start. */
  resumeAudio() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        for (const s of this.slots.values()) this.attachGain(s);
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume().catch(() => {});
  }

  private attachGain(s: Slot) {
    if (!this.ctx || s.gain) return;
    try {
      const src = this.ctx.createMediaElementSource(s.el);
      const gain = this.ctx.createGain();
      src.connect(gain).connect(this.ctx.destination);
      s.gain = gain;
    } catch {
      // Already connected or unsupported: fall back to element.volume.
    }
  }

  private slotFor(clip: MediaClip, kind: "video" | "audio"): Slot | null {
    const existing = this.slots.get(clip.id);
    if (existing && existing.mediaId === clip.mediaId) return existing;
    if (existing) this.release(clip.id);
    const url = getMediaUrl(clip.mediaId);
    if (!url) return null;
    const el = document.createElement(kind);
    el.preload = "auto";
    el.src = url;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.addEventListener("seeked", this.onFrame);
    el.addEventListener("loadeddata", this.onFrame);
    this.host.appendChild(el);
    const slot: Slot = { el, mediaId: clip.mediaId };
    this.attachGain(slot);
    this.slots.set(clip.id, slot);
    return slot;
  }

  private release(clipId: string) {
    const s = this.slots.get(clipId);
    if (!s) return;
    s.el.pause();
    s.el.removeEventListener("seeked", this.onFrame);
    s.el.removeEventListener("loadeddata", this.onFrame);
    s.el.removeAttribute("src");
    s.el.load();
    s.el.remove();
    s.gain?.disconnect();
    this.slots.delete(clipId);
  }

  private loadImage(mediaId: string) {
    if (this.images.has(mediaId)) return;
    const blob = getMediaBlob(mediaId);
    if (!blob) return;
    this.images.set(mediaId, "loading");
    createImageBitmap(blob)
      .then((bmp) => {
        this.images.set(mediaId, bmp);
        this.onFrame();
      })
      .catch(() => this.images.set(mediaId, "error"));
  }

  /** Bring all elements in line with time t. Cheap enough to call every animation frame. */
  sync(project: Project, t: number, playing: boolean) {
    const mediaById = new Map(project.media.map((m) => [m.id, m]));
    const trackById = new Map(project.tracks.map((tr) => [tr.id, tr]));
    const keep = new Set<string>();

    for (const c of project.clips) {
      if (c.type !== "media") continue;
      const media = mediaById.get(c.mediaId);
      if (!media) continue;
      const end = clipEnd(c);
      const active = t >= c.start && t < end;
      const upcoming = !active && c.start > t && c.start - t < PRELOAD_AHEAD;
      const near = t > c.start - RELEASE_DISTANCE && t < end + RELEASE_DISTANCE;

      if (media.kind === "image") {
        if (near) this.loadImage(media.id);
        continue;
      }
      if (!active && !upcoming) {
        if (near && this.slots.has(c.id)) {
          keep.add(c.id);
          const el = this.slots.get(c.id)!.el;
          if (!el.paused) el.pause();
        }
        continue;
      }

      keep.add(c.id);
      const slot = this.slotFor(c, media.kind);
      if (!slot) continue;
      const el = slot.el;
      const track = trackById.get(c.trackId);
      const silent = c.muted || !!track?.muted || !media.hasAudio;
      this.setVolume(slot, silent ? 0 : c.volume);

      const target = active ? sourceTimeAt(c, t) : c.in;
      if (active && playing) {
        if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) el.currentTime = target;
        if (el.paused) void el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        // Seek only when meaningfully off, so a paused frame doesn't re-seek every tick.
        if (Math.abs(el.currentTime - target) > 1 / 120 && !el.seeking) el.currentTime = target;
      }
    }

    for (const id of [...this.slots.keys()]) if (!keep.has(id)) this.release(id);
  }

  private setVolume(s: Slot, v: number) {
    if (s.gain) {
      s.el.volume = 1;
      if (Math.abs(s.gain.gain.value - v) > 1e-3) s.gain.gain.value = v;
    } else {
      s.el.volume = Math.min(1, v);
    }
  }

  pauseAll() {
    for (const s of this.slots.values()) s.el.pause();
  }

  getFrame = (clip: MediaClip): VisualFrame | null => {
    const img = this.images.get(clip.mediaId);
    if (img && typeof img !== "string") return { image: img, width: img.width, height: img.height };
    const s = this.slots.get(clip.id);
    if (!s || !(s.el instanceof HTMLVideoElement)) return null;
    const v = s.el;
    if (v.readyState < 2 || !v.videoWidth) return null;
    return { image: v, width: v.videoWidth, height: v.videoHeight };
  };

  /** Whether any active video is still seeking (so the frame shown may be stale). */
  isSeeking(): boolean {
    for (const s of this.slots.values()) if (s.el.seeking) return true;
    return false;
  }

  dispose() {
    for (const id of [...this.slots.keys()]) this.release(id);
    for (const img of this.images.values()) if (typeof img !== "string") img.close();
    this.images.clear();
    void this.ctx?.close().catch(() => {});
  }
}
