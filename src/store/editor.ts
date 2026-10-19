"use client";

import { create } from "zustand";
import type { Clip, MediaAsset, MediaClip, Project, TextClip, Track, TrackKind } from "@/lib/types";
import * as ops from "@/lib/timeline/ops";
import { projectDuration } from "@/lib/render";
import { uid } from "@/lib/id";
import { clamp } from "@/lib/time";

const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key within this window form one undo step (e.g. typing). */
const COALESCE_MS = 800;

export const ZOOM_MIN = 8;
export const ZOOM_MAX = 400;

export interface Notice {
  id: string;
  kind: "error" | "warning" | "info";
  text: string;
}

interface EditorState {
  project: Project;
  selectedId: string | null;
  playhead: number;
  playing: boolean;
  /** Timeline zoom in pixels per second. */
  zoom: number;
  past: Project[];
  future: Project[];
  notices: Notice[];
  importing: number;
  snapping: boolean;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  /** Time of the active snap guide while dragging, for display only. */
  snapLine: number | null;

  // history
  commit: (fn: (p: Project) => Project, coalesceKey?: string) => void;
  beginGesture: () => void;
  gesture: (fn: (p: Project) => Project) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  loadProject: (p: Project) => void;

  // transport
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  togglePlay: () => void;
  stepFrames: (n: number) => void;
  setZoom: (z: number) => void;
  toggleSnapping: () => void;
  setSnapLine: (t: number | null) => void;

  // editing
  select: (id: string | null) => void;
  addMedia: (asset: MediaAsset) => void;
  removeMedia: (id: string) => void;
  addMediaClip: (mediaId: string, at?: number, trackId?: string) => void;
  addText: () => void;
  updateClip: (id: string, patch: Partial<MediaClip> | Partial<TextClip>, coalesceKey?: string) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, dir: -1 | 1) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  renameProject: (name: string) => void;

  notify: (kind: Notice["kind"], text: string) => void;
  dismiss: (id: string) => void;
  setImporting: (delta: number) => void;
}

let gestureBase: Project | null = null;
let lastCoalesce: { key: string; at: number } | null = null;

function pushPast(past: Project[], p: Project): Project[] {
  const next = [...past, p];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function validSelection(p: Project, id: string | null): string | null {
  return id && p.clips.some((c) => c.id === id) ? id : null;
}

export const useEditor = create<EditorState>()((set, get) => ({
  project: ops.newProject(),
  selectedId: null,
  playhead: 0,
  playing: false,
  zoom: 60,
  past: [],
  future: [],
  notices: [],
  importing: 0,
  snapping: true,
  saveState: "idle",
  snapLine: null,

  commit: (fn, coalesceKey) => {
    const prev = get().project;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    const coalesce =
      coalesceKey && lastCoalesce && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
    lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
    set((s) => ({
      project: { ...next, updatedAt: now },
      past: coalesce ? s.past : pushPast(s.past, prev),
      future: [],
      selectedId: validSelection(next, s.selectedId),
    }));
  },

  // Gestures (drag/trim) update the project live but record a single undo step.
  beginGesture: () => {
    gestureBase = get().project;
  },
  gesture: (fn) => {
    const next = fn(get().project);
    if (next !== get().project) set({ project: next });
  },
  endGesture: () => {
    const base = gestureBase;
    gestureBase = null;
    lastCoalesce = null;
    if (!base || base === get().project) return;
    set((s) => ({ past: pushPast(s.past, base), future: [], project: { ...s.project, updatedAt: Date.now() } }));
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    lastCoalesce = null;
    set((s) => ({
      project: prev,
      past: past.slice(0, -1),
      future: [project, ...future],
      selectedId: validSelection(prev, s.selectedId),
    }));
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    lastCoalesce = null;
    set((s) => ({
      project: next,
      past: pushPast(past, project),
      future: future.slice(1),
      selectedId: validSelection(next, s.selectedId),
    }));
  },
  loadProject: (p) => {
    lastCoalesce = null;
    set({ project: p, past: [], future: [], selectedId: null, playhead: 0, playing: false });
  },

  setPlayhead: (t) => {
    const max = Math.max(projectDuration(get().project), 0);
    set({ playhead: clamp(t, 0, max) });
  },
  setPlaying: (v) => {
    if (v && projectDuration(get().project) <= 0) return;
    set({ playing: v });
  },
  togglePlay: () => {
    const s = get();
    if (!s.playing && s.playhead >= projectDuration(s.project) - 1e-3) set({ playhead: 0 });
    s.setPlaying(!s.playing);
  },
  stepFrames: (n) => {
    const s = get();
    // Snap to the frame grid so repeated steps don't accumulate drift.
    const frame = Math.round(s.playhead * s.project.fps) + n;
    s.setPlaying(false);
    s.setPlayhead(frame / s.project.fps);
  },
  setZoom: (z) => set({ zoom: clamp(z, ZOOM_MIN, ZOOM_MAX) }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  setSnapLine: (t) => set({ snapLine: t }),

  select: (id) => set({ selectedId: id }),

  addMedia: (asset) => get().commit((p) => ({ ...p, media: [...p.media, asset] })),
  removeMedia: (id) => get().commit((p) => ops.removeMedia(p, id)),

  addMediaClip: (mediaId, at, trackId) => {
    let newId: string | undefined;
    get().commit((p) => {
      const r = ops.addMediaClip(p, mediaId, at ?? get().playhead, trackId);
      newId = r.clip?.id;
      return r.project;
    });
    if (newId) set({ selectedId: newId });
  },

  addText: () => {
    let newId: string | undefined;
    get().commit((p) => {
      const r = ops.addTextClip(p, get().playhead);
      newId = r.clip.id;
      return r.project;
    });
    if (newId) set({ selectedId: newId });
  },

  updateClip: (id, patch, coalesceKey) => get().commit((p) => ops.updateClip(p, id, patch), coalesceKey),

  splitAtPlayhead: () => {
    const { project, playhead, selectedId } = get();
    const under = project.clips.filter((c) => playhead > c.start && playhead < c.start + c.duration);
    const sel = under.find((c) => c.id === selectedId);
    // Split the selected clip; with nothing selected, split everything under the playhead.
    const targets: Clip[] = sel ? [sel] : under;
    if (!targets.length) {
      get().notify("info", "Move the playhead over a clip to split it.");
      return;
    }
    let rightId: string | undefined;
    get().commit((p) => {
      for (const c of targets) {
        const r = ops.splitClip(p, c.id, playhead);
        p = r.project;
        if (c.id === selectedId) rightId = r.rightId;
      }
      return p;
    });
    if (rightId) set({ selectedId: rightId });
  },

  deleteSelected: () => {
    const id = get().selectedId;
    if (!id) return;
    get().commit((p) => ops.removeClips(p, [id]));
    set({ selectedId: null });
  },

  addTrack: (kind) => get().commit((p) => ops.addTrack(p, kind).project),
  removeTrack: (id) => get().commit((p) => ops.removeTrack(p, id)),
  moveTrack: (id, dir) => get().commit((p) => ops.moveTrack(p, id, dir)),
  updateTrack: (id, patch) => get().commit((p) => ops.updateTrack(p, id, patch)),
  renameProject: (name) => get().commit((p) => ({ ...p, name }), "rename"),

  notify: (kind, text) => {
    const n = { id: uid("n"), kind, text };
    set((s) => ({ notices: [...s.notices.slice(-4), n] }));
    if (kind !== "error") setTimeout(() => get().dismiss(n.id), 6000);
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  setImporting: (d) => set((s) => ({ importing: Math.max(0, s.importing + d) })),
}));

export function selectedClip(s: { project: Project; selectedId: string | null }): Clip | undefined {
  return s.project.clips.find((c) => c.id === s.selectedId);
}
