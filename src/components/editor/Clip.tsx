"use client";

import { memo, type PointerEvent as RPointerEvent } from "react";
import { Type, VolumeX } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { Clip as ClipT, MediaAsset } from "@/lib/types";
import { clipEnd } from "@/lib/types";
import * as ops from "@/lib/timeline/ops";
import { SNAP_PX, useTimelineGeometry } from "./timelineContext";

type Mode = "move" | "trim-start" | "trim-end";

interface Props {
  clip: ClipT;
  media?: MediaAsset;
  zoom: number;
  height: number;
  selected: boolean;
}

/** A clip on the timeline. Dragging the body moves it (also across tracks); the edges trim it. */
export const Clip = memo(function Clip({ clip, media, zoom, height, selected }: Props) {
  const geo = useTimelineGeometry();

  // Drag listeners live on window, not the element: moving a clip to another
  // track re-mounts it under a different lane, which would drop pointer capture.
  const onPointerDown = (e: RPointerEvent, mode: Mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const id = clip.id;
    const st0 = useEditor.getState();
    st0.select(id);
    st0.beginGesture();
    // `grab` keeps the pointer's offset from the dragged edge so nothing jumps on the first move.
    const anchor = mode === "trim-end" ? clipEnd(clip) : clip.start;
    const grab = geo.timeAt(e.clientX) - anchor;
    const x0 = e.clientX;
    const pointerId = e.pointerId;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const st = useEditor.getState();
      const cur = st.project.clips.find((c) => c.id === id);
      if (!cur) return;
      // A few pixels of slack so a click to select doesn't nudge the clip.
      if (!moved && Math.abs(ev.clientX - x0) < 3) {
        const tid = mode === "move" ? geo.trackAt(ev.clientX, ev.clientY) : null;
        if (!tid || tid === cur.trackId) return;
      }
      moved = true;
      const t = geo.timeAt(ev.clientX) - grab;
      const threshold = SNAP_PX / st.zoom;
      const cands = st.snapping ? ops.snapCandidates(st.project, st.playhead, id) : [];

      if (mode === "move") {
        let start = Math.max(0, t);
        let line: number | null = null;
        if (cands.length) {
          // Snap whichever edge (start or end) is closer to a candidate.
          const a = ops.snapTime(start, cands, threshold);
          const b = ops.snapTime(start + cur.duration, cands, threshold);
          const da = a.snapped === null ? Infinity : Math.abs(a.t - start);
          const db = b.snapped === null ? Infinity : Math.abs(b.t - (start + cur.duration));
          if (da <= db && a.snapped !== null) {
            start = a.t;
            line = a.t;
          } else if (b.snapped !== null) {
            start = b.t - cur.duration;
            line = b.t;
          }
        }
        const trackId = geo.trackAt(ev.clientX, ev.clientY) ?? cur.trackId;
        st.gesture((p) => ops.moveClip(p, id, trackId, start));
        st.setSnapLine(line);
      } else {
        const s = cands.length ? ops.snapTime(t, cands, threshold) : { t, snapped: null };
        st.gesture((p) => ops.trimClip(p, id, mode === "trim-start" ? "start" : "end", s.t));
        st.setSnapLine(s.snapped);
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const st = useEditor.getState();
      st.setSnapLine(null);
      st.endGesture();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);
  const kind = clip.type === "text" ? "text" : media?.kind ?? "video";
  const color =
    kind === "text" ? "bg-clip-text" : kind === "audio" ? "bg-clip-audio" : "bg-clip-video";
  const label = clip.type === "text" ? clip.text.split("\n")[0] || "Text" : media?.name ?? "Missing media";
  const showThumb = clip.type === "media" && media?.thumbnail && kind !== "audio";
  const muted = clip.type === "media" && (clip.muted || clip.volume === 0);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${kind} clip ${label}, ${clip.start.toFixed(2)}s to ${clipEnd(clip).toFixed(2)}s`}
      aria-pressed={selected}
      data-clip-id={clip.id}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onFocus={() => useEditor.getState().select(clip.id)}
      className={`group absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-md text-white select-none active:cursor-grabbing ${color} ${
        selected ? "z-10 ring-2 ring-white" : "ring-1 ring-black/30"
      }`}
      style={{
        left,
        width,
        height: height - 8,
        backgroundImage: showThumb ? `url(${media!.thumbnail})` : undefined,
        backgroundSize: showThumb ? "auto 100%" : undefined,
        backgroundRepeat: "repeat-x",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/30" />
      <div className="pointer-events-none relative flex items-center gap-1 px-2 pt-0.5 text-[11px] leading-4 font-medium">
        {clip.type === "text" && <Type className="h-3 w-3 shrink-0" aria-hidden />}
        {muted && <VolumeX className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate drop-shadow">{label}</span>
      </div>
      {kind === "audio" && <Wave />}
      {(["trim-start", "trim-end"] as const).map((m) => (
        <div
          key={m}
          aria-hidden
          onPointerDown={(e) => onPointerDown(e, m)}
          className={`absolute top-0 bottom-0 w-2.5 cursor-ew-resize touch-none bg-white/0 transition-colors hover:bg-white/60 ${
            m === "trim-start" ? "left-0 rounded-l-md" : "right-0 rounded-r-md"
          } ${selected ? "bg-white/40" : ""}`}
        />
      ))}
    </div>
  );
});

/** Decorative waveform-ish stripe; real waveforms are out of scope for the MVP. */
function Wave() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-1 h-1/2 opacity-40"
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, rgba(255,255,255,.9) 0 2px, transparent 2px 5px)",
        maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
      }}
    />
  );
}
