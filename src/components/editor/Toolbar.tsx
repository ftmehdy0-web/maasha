"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Magnet, Maximize2, Music, Plus, Redo2, Scissors, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor, ZOOM_MAX, ZOOM_MIN } from "@/store/editor";
import type { TrackKind } from "@/lib/types";
import { IconButton } from "./ui";

export function Toolbar({ onZoom, onFit }: { onZoom: (z: number) => void; onFit: () => void }) {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selectedId !== null);
  const zoom = useEditor((s) => s.zoom);
  const snapping = useEditor((s) => s.snapping);
  const st = useEditor.getState;

  // Zoom slider is logarithmic so each step feels the same.
  const toSlider = (z: number) => Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
  const fromSlider = (v: number) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v);

  return (
    <div role="toolbar" aria-label="Timeline tools" className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <IconButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={() => st().undo()}>
        <Undo2 className="h-4 w-4" />
      </IconButton>
      <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => st().redo()}>
        <Redo2 className="h-4 w-4" />
      </IconButton>
      <Divider />
      <IconButton label="Split at playhead" shortcut="S" onClick={() => st().splitAtPlayhead()}>
        <Scissors className="h-4 w-4" />
      </IconButton>
      <IconButton label="Delete selected clip" shortcut="Delete" disabled={!hasSelection} onClick={() => st().deleteSelected()}>
        <Trash2 className="h-4 w-4" />
      </IconButton>
      <Divider />
      <IconButton label="Add text" onClick={() => st().addText()}>
        <Type className="h-4 w-4" />
      </IconButton>
      <AddTrackMenu />
      <div className="flex-1" />
      <IconButton label={snapping ? "Snapping on" : "Snapping off"} active={snapping} onClick={() => st().toggleSnapping()}>
        <Magnet className="h-4 w-4" />
      </IconButton>
      <Divider />
      <IconButton label="Zoom out" onClick={() => onZoom(zoom / 1.4)}>
        <ZoomOut className="h-4 w-4" />
      </IconButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={toSlider(zoom)}
        onChange={(e) => onZoom(fromSlider(Number(e.target.value)))}
        aria-label="Timeline zoom"
        className="w-24 lg:w-32"
      />
      <IconButton label="Zoom in" onClick={() => onZoom(zoom * 1.4)}>
        <ZoomIn className="h-4 w-4" />
      </IconButton>
      <IconButton label="Fit timeline to view" onClick={onFit}>
        <Maximize2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-line" aria-hidden />;
}

function AddTrackMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const add = (kind: TrackKind) => {
    useEditor.getState().addTrack(kind);
    setOpen(false);
  };
  const items: [TrackKind, string, typeof Film][] = [
    ["video", "Video track", Film],
    ["audio", "Audio track", Music],
    ["text", "Text track", Type],
  ];

  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <IconButton label="Add track" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="h-4 w-4" />
        <span className="ml-1 hidden text-xs sm:inline">Track</span>
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-9 left-0 z-50 w-40 rounded-md border border-line bg-panel-2 p-1 shadow-xl">
          {items.map(([kind, label, Icon]) => (
            <button
              key={kind}
              role="menuitem"
              type="button"
              autoFocus={kind === "video"}
              onClick={() => add(kind)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-raised"
            >
              <Icon className="h-4 w-4 text-muted" aria-hidden /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
