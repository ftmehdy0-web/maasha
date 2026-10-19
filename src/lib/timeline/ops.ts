// Pure timeline operations: (project, args) -> new project. The store wraps
// these with history; tests exercise them directly.

import type { Clip, MediaAsset, MediaClip, Project, TextClip, Track, TrackKind } from "../types";
import { IMAGE_DEFAULT_DURATION, MIN_CLIP_DURATION, TEXT_DEFAULT_DURATION, clipEnd } from "../types";
import { uid } from "../id";

const EPS = 1e-6;

export function newProject(name = "Untitled project"): Project {
  const now = Date.now();
  return {
    id: uid("p_"),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    media: [],
    tracks: [
      { id: uid("t_"), kind: "text", name: "Text 1", muted: false },
      { id: uid("t_"), kind: "video", name: "Video 1", muted: false },
      { id: uid("t_"), kind: "audio", name: "Audio 1", muted: false },
    ],
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function trackKindFor(media: MediaAsset): TrackKind {
  return media.kind === "audio" ? "audio" : "video";
}

export function clipsOnTrack(p: Project, trackId: string, exceptId?: string): Clip[] {
  return p.clips
    .filter((c) => c.trackId === trackId && c.id !== exceptId)
    .sort((a, b) => a.start - b.start);
}

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

/**
 * Nearest start >= 0 to `desired` where a clip of `duration` fits on the track
 * without overlapping others. Clips never overlap within a track, which keeps
 * layering and trimming simple.
 */
export function findFreeStart(others: Clip[], desired: number, duration: number): number {
  const candidates = [Math.max(0, desired)];
  for (const o of others) {
    candidates.push(clipEnd(o));
    if (o.start - duration >= 0) candidates.push(o.start - duration);
  }
  let best = Infinity;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (others.some((o) => overlaps(c, c + duration, o.start, clipEnd(o)))) continue;
    const d = Math.abs(c - desired);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // Fallback: after the last clip (always free).
  if (!Number.isFinite(best)) best = Math.max(0, ...others.map(clipEnd));
  return best;
}

function nextTrackName(p: Project, kind: TrackKind): string {
  const label = kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Text";
  let n = 1;
  while (p.tracks.some((t) => t.name === `${label} ${n}`)) n++;
  return `${label} ${n}`;
}

export function addTrack(p: Project, kind: TrackKind): { project: Project; track: Track } {
  const track: Track = { id: uid("t_"), kind, name: nextTrackName(p, kind), muted: false };
  // Keep a sensible order: text on top, then video, then audio at the bottom.
  const tracks = [...p.tracks];
  let idx: number;
  if (kind === "text") idx = 0;
  else if (kind === "video") {
    const firstVideo = tracks.findIndex((t) => t.kind === "video");
    idx = firstVideo >= 0 ? firstVideo : tracks.findIndex((t) => t.kind === "audio");
    if (idx < 0) idx = tracks.length;
  } else idx = tracks.length;
  tracks.splice(idx, 0, track);
  return { project: { ...p, tracks }, track };
}

export function removeTrack(p: Project, trackId: string): Project {
  return {
    ...p,
    tracks: p.tracks.filter((t) => t.id !== trackId),
    clips: p.clips.filter((c) => c.trackId !== trackId),
  };
}

export function moveTrack(p: Project, trackId: string, dir: -1 | 1): Project {
  const i = p.tracks.findIndex((t) => t.id === trackId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.tracks.length) return p;
  const tracks = [...p.tracks];
  [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  return { ...p, tracks };
}

export function updateTrack(p: Project, trackId: string, patch: Partial<Track>): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) };
}

/** Picks the given track if compatible, otherwise the first compatible one, creating it if needed. */
export function ensureTrack(p: Project, kind: TrackKind, preferredId?: string): { project: Project; trackId: string } {
  const pref = preferredId && p.tracks.find((t) => t.id === preferredId && t.kind === kind);
  if (pref) return { project: p, trackId: pref.id };
  const first = p.tracks.find((t) => t.kind === kind);
  if (first) return { project: p, trackId: first.id };
  const { project, track } = addTrack(p, kind);
  return { project, trackId: track.id };
}

export function addMediaClip(
  p: Project,
  mediaId: string,
  at: number,
  trackId?: string,
): { project: Project; clip?: MediaClip } {
  const media = p.media.find((m) => m.id === mediaId);
  if (!media) return { project: p };
  const ensured = ensureTrack(p, trackKindFor(media), trackId);
  p = ensured.project;
  const duration = Number.isFinite(media.duration) ? media.duration : IMAGE_DEFAULT_DURATION;
  const start = findFreeStart(clipsOnTrack(p, ensured.trackId), at, duration);
  const clip: MediaClip = {
    id: uid("c_"),
    type: "media",
    trackId: ensured.trackId,
    mediaId,
    start,
    duration,
    in: 0,
    volume: 1,
    muted: false,
  };
  return { project: { ...p, clips: [...p.clips, clip] }, clip };
}

export function addTextClip(p: Project, at: number, trackId?: string): { project: Project; clip: TextClip } {
  const ensured = ensureTrack(p, "text", trackId);
  p = ensured.project;
  const start = findFreeStart(clipsOnTrack(p, ensured.trackId), at, TEXT_DEFAULT_DURATION);
  const clip: TextClip = {
    id: uid("c_"),
    type: "text",
    trackId: ensured.trackId,
    start,
    duration: TEXT_DEFAULT_DURATION,
    text: "Your text",
    font: "Inter, Arial, sans-serif",
    size: 96,
    color: "#ffffff",
    x: 0.5,
    y: 0.5,
  };
  return { project: { ...p, clips: [...p.clips, clip] }, clip };
}

export function updateClip(p: Project, id: string, patch: Partial<MediaClip> | Partial<TextClip>): Project {
  return {
    ...p,
    clips: p.clips.map((c) => (c.id === id ? ({ ...c, ...patch } as Clip) : c)),
  };
}

export function removeClips(p: Project, ids: string[]): Project {
  const set = new Set(ids);
  return { ...p, clips: p.clips.filter((c) => !set.has(c.id)) };
}

export function trackOf(p: Project, trackId: string): Track | undefined {
  return p.tracks.find((t) => t.id === trackId);
}

export function canPlaceOnTrack(p: Project, clip: Clip, track: Track): boolean {
  if (clip.type === "text") return track.kind === "text";
  const media = p.media.find((m) => m.id === clip.mediaId);
  return !!media && trackKindFor(media) === track.kind;
}

/** Moves a clip to (trackId, desired start), resolving overlaps on the target track. */
export function moveClip(p: Project, id: string, trackId: string, desired: number): Project {
  const clip = p.clips.find((c) => c.id === id);
  const track = trackOf(p, trackId);
  if (!clip || !track) return p;
  const target = canPlaceOnTrack(p, clip, track) ? trackId : clip.trackId;
  const start = findFreeStart(clipsOnTrack(p, target, id), desired, clip.duration);
  if (start === clip.start && target === clip.trackId) return p;
  return updateClip(p, id, { start, trackId: target });
}

/** Limits for trimming an edge: neighbours on the track and the source media length. */
export function trimBounds(p: Project, id: string): { minStart: number; maxEnd: number } {
  const clip = p.clips.find((c) => c.id === id)!;
  const others = clipsOnTrack(p, clip.trackId, id);
  let minStart = 0;
  let maxEnd = Infinity;
  for (const o of others) {
    if (clipEnd(o) <= clip.start + EPS) minStart = Math.max(minStart, clipEnd(o));
    if (o.start >= clipEnd(clip) - EPS) maxEnd = Math.min(maxEnd, o.start);
  }
  if (clip.type === "media") {
    const media = p.media.find((m) => m.id === clip.mediaId);
    if (media && Number.isFinite(media.duration)) {
      minStart = Math.max(minStart, clip.start - clip.in);
      maxEnd = Math.min(maxEnd, clip.start - clip.in + media.duration);
    }
  }
  return { minStart, maxEnd };
}

/** Moves the left or right edge of a clip to time t, clamped to valid bounds. */
export function trimClip(p: Project, id: string, edge: "start" | "end", t: number): Project {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip) return p;
  const { minStart, maxEnd } = trimBounds(p, id);
  const end = clipEnd(clip);
  if (edge === "start") {
    const ns = Math.min(Math.max(t, minStart), end - MIN_CLIP_DURATION);
    const delta = ns - clip.start;
    const patch: Partial<MediaClip> = { start: ns, duration: end - ns };
    if (clip.type === "media") patch.in = Math.max(0, clip.in + delta);
    return updateClip(p, id, patch);
  }
  const ne = Math.max(Math.min(t, maxEnd), clip.start + MIN_CLIP_DURATION);
  return updateClip(p, id, { duration: ne - clip.start });
}

/** Splits a clip at t into two adjacent clips. Returns the id of the right half. */
export function splitClip(p: Project, id: string, t: number): { project: Project; rightId?: string } {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip) return { project: p };
  const end = clipEnd(clip);
  if (t <= clip.start + MIN_CLIP_DURATION - EPS || t >= end - MIN_CLIP_DURATION + EPS) return { project: p };
  const left = { ...clip, duration: t - clip.start } as Clip;
  const right = { ...clip, id: uid("c_"), start: t, duration: end - t } as Clip;
  if (right.type === "media" && clip.type === "media") right.in = clip.in + (t - clip.start);
  const clips = p.clips.flatMap((c) => (c.id === id ? [left, right] : [c]));
  return { project: { ...p, clips }, rightId: right.id };
}

export function removeMedia(p: Project, mediaId: string): Project {
  return {
    ...p,
    media: p.media.filter((m) => m.id !== mediaId),
    clips: p.clips.filter((c) => c.type !== "media" || c.mediaId !== mediaId),
  };
}

/** Snap a time to the nearest candidate within `threshold` seconds. */
export function snapTime(t: number, candidates: number[], threshold: number): { t: number; snapped: number | null } {
  let best: number | null = null;
  let bestD = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best === null ? { t, snapped: null } : { t: best, snapped: best };
}

export function snapCandidates(p: Project, playhead: number, exceptId?: string): number[] {
  const out = [0, playhead];
  for (const c of p.clips) {
    if (c.id === exceptId) continue;
    out.push(c.start, clipEnd(c));
  }
  return out;
}
