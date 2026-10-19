"use client";

import { memo, type DragEvent } from "react";
import { ChevronDown, ChevronUp, Film, Music, Trash2, Type, Volume2, VolumeX } from "lucide-react";
import { useEditor } from "@/store/editor";
import type { Clip as ClipT, MediaAsset, Track as TrackT } from "@/lib/types";
import { Clip } from "./Clip";
import { MEDIA_DRAG_TYPE } from "./MediaLibrary";
import { HEADER_W, TRACK_H, useTimelineGeometry } from "./timelineContext";
import { IconButton } from "./ui";

export function TrackHeader({ track, index, count }: { track: TrackT; index: number; count: number }) {
  const updateTrack = useEditor((s) => s.updateTrack);
  const removeTrack = useEditor((s) => s.removeTrack);
  const moveTrack = useEditor((s) => s.moveTrack);
  const clipCount = useEditor((s) => s.project.clips.filter((c) => c.trackId === track.id).length);
  const Icon = track.kind === "video" ? Film : track.kind === "audio" ? Music : Type;

  return (
    <div
      className="sticky left-0 z-20 flex items-center gap-0.5 border-r border-b border-line bg-panel px-1.5"
      style={{ width: HEADER_W, height: TRACK_H[track.kind] }}
    >
      <Icon className="mr-1 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs">{track.name}</span>
      {track.kind !== "text" && (
        <IconButton
          label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
          active={track.muted}
          className="h-6 min-w-6"
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </IconButton>
      )}
      <div className="flex flex-col">
        <button
          type="button"
          aria-label={`Move ${track.name} up (draws on top)`}
          title="Move up"
          disabled={index === 0}
          onClick={() => moveTrack(track.id, -1)}
          className="rounded text-muted hover:text-fg disabled:opacity-25"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label={`Move ${track.name} down`}
          title="Move down"
          disabled={index === count - 1}
          onClick={() => moveTrack(track.id, 1)}
          className="rounded text-muted hover:text-fg disabled:opacity-25"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <IconButton
        label={`Delete ${track.name}`}
        className="h-6 min-w-6 hover:text-danger"
        onClick={() => {
          if (clipCount && !confirm(`Delete ${track.name} and its ${clipCount} clip(s)?`)) return;
          removeTrack(track.id);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

interface LaneProps {
  track: TrackT;
  clips: ClipT[];
  mediaById: Map<string, MediaAsset>;
  zoom: number;
  width: number;
  selectedId: string | null;
}

export const TrackLane = memo(function TrackLane({ track, clips, mediaById, zoom, width, selectedId }: LaneProps) {
  const geo = useTimelineGeometry();
  const h = TRACK_H[track.kind];

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    useEditor.getState().addMediaClip(id, Math.max(0, geo.timeAt(e.clientX)), track.id);
  };

  return (
    <div
      data-track-id={track.id}
      className={`relative border-b border-line ${track.muted ? "opacity-60" : ""}`}
      style={{ width, height: h }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {clips.map((c) => (
        <Clip
          key={c.id}
          clip={c}
          media={c.type === "media" ? mediaById.get(c.mediaId) : undefined}
          zoom={zoom}
          height={h}
          selected={c.id === selectedId}
        />
      ))}
    </div>
  );
});
