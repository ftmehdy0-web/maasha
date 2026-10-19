"use client";

import { useRef, useState, type DragEvent } from "react";
import { Film, Image as ImageIcon, Loader2, Music, Plus, Trash2, Upload } from "lucide-react";
import { useEditor } from "@/store/editor";
import { importFiles } from "@/lib/media/importFiles";
import { hasMedia } from "@/lib/media/registry";
import { formatBytes, formatShort } from "@/lib/time";
import type { MediaAsset } from "@/lib/types";
import { IconButton } from "./ui";

export const MEDIA_DRAG_TYPE = "application/x-maasha-media";

const ACCEPT = "video/*,audio/*,image/*,.mov,.mkv,.m4a,.mp3,.wav,.flac,.ogg,.opus";

export function MediaLibrary() {
  const media = useEditor((s) => s.project.media);
  const importing = useEditor((s) => s.importing);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void importFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <section
      aria-label="Media library"
      className={`area-lib flex min-h-0 flex-col border-r border-line bg-panel ${over ? "ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <header className="flex h-10 items-center justify-between border-b border-line px-3">
        <h2 className="text-sm font-semibold">Media</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-strong"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden /> Import
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          aria-label="Import media files"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {importing > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-panel-2 px-2 py-2 text-xs text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Importing {importing} file{importing > 1 ? "s" : ""}…
          </div>
        )}
        {media.length === 0 && importing === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-center text-sm text-muted hover:border-accent hover:text-fg"
          >
            <Upload className="h-6 w-6" aria-hidden />
            <span>
              Drop video, audio or images here
              <br />
              <span className="text-xs">or click to browse</span>
            </span>
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {media.map((m) => (
              <MediaItem key={m.id} asset={m} />
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-line px-3 py-2 text-[11px] leading-tight text-muted">
        Files stay on your device. Nothing is uploaded.
      </p>
    </section>
  );
}

function MediaItem({ asset }: { asset: MediaAsset }) {
  const addMediaClip = useEditor((s) => s.addMediaClip);
  const removeMedia = useEditor((s) => s.removeMedia);
  const usedCount = useEditor((s) => s.project.clips.filter((c) => c.type === "media" && c.mediaId === asset.id).length);
  const missing = !hasMedia(asset.id);
  const Icon = asset.kind === "video" ? Film : asset.kind === "audio" ? Music : ImageIcon;

  return (
    <li
      className="group relative overflow-hidden rounded-lg border border-line bg-panel-2"
      draggable={!missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(MEDIA_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={`${asset.name} · ${formatBytes(asset.size)}`}
    >
      <div className="relative aspect-video bg-black/50">
        {asset.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
          <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon className="h-6 w-6 text-muted" aria-hidden />
          </div>
        )}
        {Number.isFinite(asset.duration) && (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] tabular-nums">
            {formatShort(asset.duration)}
          </span>
        )}
        {missing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/70 px-2 text-center text-[11px] text-warn">
            File missing — re-import
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <Icon className="h-3 w-3 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px]">{asset.name}</span>
      </div>
      <div className="absolute top-1 right-1 flex gap-1 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
        <IconButton
          label={`Add ${asset.name} to timeline at playhead`}
          className="h-6 min-w-6 bg-black/70 hover:bg-accent"
          disabled={missing}
          onClick={() => addMediaClip(asset.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label={`Remove ${asset.name} from project`}
          className="h-6 min-w-6 bg-black/70 hover:bg-danger"
          onClick={() => {
            if (usedCount && !confirm(`“${asset.name}” is used by ${usedCount} clip(s). Remove it and those clips?`)) return;
            removeMedia(asset.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </li>
  );
}
