"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useEditor } from "@/store/editor";
import { projectDuration } from "@/lib/render";
import type { Clip, MediaAsset } from "@/lib/types";
import { formatShort } from "@/lib/time";
import { MEDIA_DRAG_TYPE } from "./MediaLibrary";
import { TrackHeader, TrackLane } from "./Track";
import { HEADER_W, TimelineCtx, type TimelineGeometry } from "./timelineContext";
import { Toolbar } from "./Toolbar";

const RULER_H = 26;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function Timeline() {
  const tracks = useEditor((s) => s.project.tracks);
  const clips = useEditor((s) => s.project.clips);
  const media = useEditor((s) => s.project.media);
  const zoom = useEditor((s) => s.zoom);
  const selectedId = useEditor((s) => s.selectedId);
  const duration = useEditor((s) => projectDuration(s.project));

  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const zoomAnchor = useRef<{ t: number; px: number } | null>(null);

  const mediaById = useMemo(() => new Map<string, MediaAsset>(media.map((m) => [m.id, m])), [media]);
  const clipsByTrack = useMemo(() => {
    const m = new Map<string, Clip[]>();
    for (const c of clips) m.set(c.trackId, [...(m.get(c.trackId) ?? []), c]);
    return m;
  }, [clips]);

  const contentW = Math.max((duration + 30) * zoom, viewW - HEADER_W);

  const geometry = useMemo<TimelineGeometry>(
    () => ({
      timeAt: (x) => {
        const r = lanesRef.current!.getBoundingClientRect();
        return (x - r.left) / useEditor.getState().zoom;
      },
      trackAt: (_x, y) => {
        const rows = lanesRef.current?.querySelectorAll<HTMLElement>("[data-track-id]") ?? [];
        for (const row of rows) {
          const r = row.getBoundingClientRect();
          if (y >= r.top && y < r.bottom) return row.dataset.trackId || null;
        }
        return null;
      },
    }),
    [],
  );

  useEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    // Ctrl/⌘ + wheel zooms around the cursor; needs a non-passive listener.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useEditor.getState();
      const px = e.clientX - el.getBoundingClientRect().left - HEADER_W;
      zoomAnchor.current = { t: (el.scrollLeft + px) / st.zoom, px };
      st.setZoom(st.zoom * Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Keep the time under the cursor (or the playhead) fixed when zoom changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const a = zoomAnchor.current;
    zoomAnchor.current = null;
    if (a) el.scrollLeft = a.t * zoom - a.px;
  }, [zoom]);

  // Follow the playhead during playback.
  useEffect(
    () =>
      useEditor.subscribe((s, prev) => {
        if (!s.playing || s.playhead === prev.playhead) return;
        const el = scrollRef.current;
        if (!el) return;
        const x = s.playhead * s.zoom;
        const visible = el.clientWidth - HEADER_W;
        if (x < el.scrollLeft || x > el.scrollLeft + visible - 40) el.scrollLeft = x - 40;
      }),
    [],
  );

  // Scrubbing on the ruler or empty lane space.
  const scrub = useRef(false);
  const onScrubDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    scrub.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    useEditor.getState().setPlayhead(Math.max(0, geometry.timeAt(e.clientX)));
  };
  const onScrubMove = (e: RPointerEvent) => {
    if (scrub.current) useEditor.getState().setPlayhead(Math.max(0, geometry.timeAt(e.clientX)));
  };
  const onScrubUp = () => {
    scrub.current = false;
  };

  const zoomAroundPlayhead = useCallback((z: number) => {
    const el = scrollRef.current;
    const st = useEditor.getState();
    if (el) zoomAnchor.current = { t: st.playhead, px: st.playhead * st.zoom - el.scrollLeft };
    st.setZoom(z);
  }, []);

  return (
    <section aria-label="Timeline" className="flex h-[min(42vh,360px)] min-h-[220px] shrink-0 flex-col border-t border-line bg-panel">
      <Toolbar
        onZoom={zoomAroundPlayhead}
        onFit={() => {
          const avail = (scrollRef.current?.clientWidth ?? 800) - HEADER_W - 40;
          zoomAnchor.current = { t: 0, px: 0 };
          useEditor.getState().setZoom(duration > 0 ? avail / duration : 60);
        }}
      />
      <TimelineCtx.Provider value={geometry}>
        <div ref={scrollRef} className="scrollbar-thin relative min-h-0 flex-1 overflow-auto" data-testid="timeline-scroll">
          <div className="relative" style={{ width: HEADER_W + contentW, minHeight: "100%" }}>
            {/* Ruler */}
            <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
              <div className="sticky left-0 z-10 shrink-0 border-r border-b border-line bg-panel" style={{ width: HEADER_W }} />
              <div
                className="relative flex-1 cursor-pointer touch-none border-b border-line bg-panel-2"
                onPointerDown={onScrubDown}
                onPointerMove={onScrubMove}
                onPointerUp={onScrubUp}
                onPointerCancel={onScrubUp}
                data-testid="ruler"
              >
                <Ruler zoom={zoom} width={contentW} />
              </div>
            </div>

            <div className="flex">
              <div className="sticky left-0 z-20 shrink-0" style={{ width: HEADER_W }}>
                {tracks.map((t, i) => (
                  <TrackHeader key={t.id} track={t} index={i} count={tracks.length} />
                ))}
              </div>
              <div
                ref={lanesRef}
                className="relative"
                style={{ width: contentW }}
                onPointerDown={(e) => {
                  const d = (e.target as HTMLElement).dataset;
                  if (e.target === e.currentTarget || d.trackId || d.emptyLane) {
                    useEditor.getState().select(null);
                    onScrubDown(e);
                  }
                }}
                onPointerMove={onScrubMove}
                onPointerUp={onScrubUp}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) e.preventDefault();
                }}
                onDrop={(e) => {
                  // Dropped below the tracks: let the store pick/create a compatible track.
                  const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
                  if (!id) return;
                  e.preventDefault();
                  useEditor.getState().addMediaClip(id, Math.max(0, geometry.timeAt(e.clientX)));
                }}
              >
                {tracks.map((t) => (
                  <TrackLane
                    key={t.id}
                    track={t}
                    clips={clipsByTrack.get(t.id) ?? EMPTY}
                    mediaById={mediaById}
                    zoom={zoom}
                    width={contentW}
                    selectedId={selectedId}
                  />
                ))}
                <div className="flex h-12 items-center px-3 text-xs text-muted/70 select-none" data-empty-lane="true">
                  {clips.length === 0 ? "Drag media here, or use + on a library item" : ""}
                </div>
                <Playhead zoom={zoom} />
                <SnapLine zoom={zoom} />
              </div>
            </div>
            <PlayheadHandle zoom={zoom} onDown={onScrubDown} onMove={onScrubMove} onUp={onScrubUp} />
          </div>
        </div>
      </TimelineCtx.Provider>
    </section>
  );
}

const EMPTY: Clip[] = [];

function Ruler({ zoom, width }: { zoom: number; width: number }) {
  const step = TICK_STEPS.find((s) => s * zoom >= 70) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t * zoom <= width; t += step) ticks.push(t);
  return (
    <>
      {ticks.map((t) => (
        <div key={t} className="pointer-events-none absolute top-0 bottom-0 border-l border-line" style={{ left: t * zoom }}>
          <span className="absolute top-1 left-1 font-mono text-[10px] text-muted tabular-nums">
            {step < 1 ? t.toFixed(step < 0.5 ? 2 : 1) + "s" : formatShort(t)}
          </span>
        </div>
      ))}
    </>
  );
}

function Playhead({ zoom }: { zoom: number }) {
  const playhead = useEditor((s) => s.playhead);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-accent-strong"
      style={{ left: playhead * zoom }}
    />
  );
}

function PlayheadHandle({
  zoom,
  onDown,
  onMove,
  onUp,
}: {
  zoom: number;
  onDown: (e: RPointerEvent) => void;
  onMove: (e: RPointerEvent) => void;
  onUp: () => void;
}) {
  const playhead = useEditor((s) => s.playhead);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuenow={Number(playhead.toFixed(2))}
      aria-valuetext={`${playhead.toFixed(2)} seconds`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onKeyDown={(e) => {
        // Arrow keys are handled globally (frame step); Home/End jump here.
        if (e.key === "Home") setPlayhead(0);
        if (e.key === "End") setPlayhead(Infinity);
      }}
      className="absolute top-0 z-40 -ml-[7px] h-[18px] w-[15px] cursor-ew-resize touch-none"
      style={{ left: HEADER_W + playhead * zoom }}
    >
      <svg viewBox="0 0 15 18" className="h-full w-full drop-shadow" aria-hidden>
        <path d="M1 1h13v10l-6.5 6L1 11z" fill="var(--color-accent-strong)" />
      </svg>
    </div>
  );
}

function SnapLine({ zoom }: { zoom: number }) {
  const t = useEditor((s) => s.snapLine);
  if (t === null) return null;
  return <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-warn" style={{ left: t * zoom }} />;
}
