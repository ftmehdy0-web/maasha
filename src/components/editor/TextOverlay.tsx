"use client";

import { useState, type PointerEvent as RPointerEvent } from "react";
import { selectedClip, useEditor } from "@/store/editor";
import { isActiveAt, layoutText, visibleClipsAt, type Ctx2D } from "@/lib/render";
import type { TextClip } from "@/lib/types";
import { clamp } from "@/lib/time";

let measureCtx: Ctx2D | null = null;
function measurer(): Ctx2D {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

/** Snap a normalised coordinate to the frame centre when close (1.5%). */
const snapCentre = (v: number) => (Math.abs(v - 0.5) < 0.015 ? 0.5 : v);

/**
 * Transparent layer over the preview canvas: hit-tests text overlays so they can
 * be selected and dragged, and outlines the selected one. Layout comes from the
 * shared renderer so the box matches what is drawn.
 */
export function TextOverlay({ width: W, height: H }: { width: number; height: number }) {
  const sel = useEditor((s) => {
    const c = selectedClip(s);
    return c?.type === "text" && isActiveAt(c, s.playhead) ? c : null;
  });
  const [hover, setHover] = useState(false);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const toCanvas = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const hitTest = (x: number, y: number): TextClip | null => {
    const s = useEditor.getState();
    const texts = visibleClipsAt(s.project, s.playhead).filter((c): c is TextClip => c.type === "text");
    // Topmost first; prefer the current selection when overlapping.
    texts.reverse();
    texts.sort((a, b) => Number(b.id === s.selectedId) - Number(a.id === s.selectedId));
    const pad = 8;
    for (const c of texts) {
      const L = layoutText(measurer(), c, W, H);
      if (x >= L.x - pad && x <= L.x + L.w + pad && y >= L.y - pad && y <= L.y + L.h + pad) return c;
    }
    return null;
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const p = toCanvas(e, el);
    const hit = hitTest(p.x, p.y);
    const st = useEditor.getState();
    if (!hit) {
      if (selectedClip(st)?.type === "text") st.select(null);
      return;
    }
    e.preventDefault();
    st.select(hit.id);
    st.beginGesture();
    const off = { x: p.x - hit.x * W, y: p.y - hit.y * H };
    const pointerId = e.pointerId;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const q = toCanvas(ev, el);
      const nx = snapCentre(clamp((q.x - off.x) / W, 0, 1));
      const ny = snapCentre(clamp((q.y - off.y) / H, 0, 1));
      setGuides({ x: nx === 0.5, y: ny === 0.5 });
      useEditor.getState().gesture((proj) => ({
        ...proj,
        clips: proj.clips.map((c) => (c.id === hit.id ? { ...c, x: nx, y: ny } : c)),
      }));
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setGuides({ x: false, y: false });
      useEditor.getState().endGesture();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const box = sel ? layoutText(measurer(), sel, W, H) : null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: hover ? "move" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        const p = toCanvas(e, e.currentTarget);
        setHover(!!hitTest(p.x, p.y));
      }}
      onPointerLeave={() => setHover(false)}
      data-testid="text-overlay"
    >
      {guides.x && <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-accent-strong/80" />}
      {guides.y && <div className="pointer-events-none absolute top-1/2 right-0 left-0 h-px bg-accent-strong/80" />}
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm border border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
          style={{
            left: pct(box.x - 6, W),
            top: pct(box.y - 4, H),
            width: pct(box.w + 12, W),
            height: pct(box.h + 8, H),
          }}
        />
      )}
    </div>
  );
}
