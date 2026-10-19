"use client";

import { Volume2, VolumeX } from "lucide-react";
import { selectedClip, useEditor } from "@/store/editor";
import type { MediaClip } from "@/lib/types";
import { clipEnd } from "@/lib/types";
import { projectDuration } from "@/lib/render";
import { formatTime } from "@/lib/time";
import { TextEditor } from "./TextEditor";
import { Field } from "./ui";

export function Inspector() {
  const clip = useEditor(selectedClip);

  return (
    <aside aria-label="Inspector" className="scrollbar-thin flex min-h-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <header className="flex h-10 shrink-0 items-center border-b border-line px-3">
        <h2 className="text-sm font-semibold">
          {clip ? (clip.type === "text" ? "Text" : "Clip") : "Project"}
        </h2>
      </header>
      <div className="p-3">
        {!clip && <ProjectInfo />}
        {clip?.type === "media" && <MediaClipPanel key={clip.id} clip={clip} />}
        {clip?.type === "text" && <TextEditor key={clip.id} clip={clip} />}
      </div>
    </aside>
  );
}

function ProjectInfo() {
  const p = useEditor((s) => s.project);
  const duration = projectDuration(p);
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Canvas</dt>
        <dd>16:9 · {p.fps} fps</dd>
        <dt className="text-muted">Duration</dt>
        <dd className="tabular-nums">{formatTime(duration, p.fps)}</dd>
        <dt className="text-muted">Tracks</dt>
        <dd>{p.tracks.length}</dd>
        <dt className="text-muted">Clips</dt>
        <dd>{p.clips.length}</dd>
      </dl>
      <p className="text-xs leading-relaxed text-muted">Select a clip on the timeline to edit it.</p>
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-muted">Shortcuts</h3>
        <ul className="space-y-1 text-xs">
          {[
            ["Space", "Play / pause"],
            ["S", "Split at playhead"],
            ["Delete", "Remove clip"],
            ["Ctrl+Z", "Undo"],
            ["Ctrl+Shift+Z", "Redo"],
            ["← / →", "Step one frame"],
            ["Shift+← / →", "Step one second"],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2">
              <kbd className="rounded border border-line bg-panel-2 px-1.5 font-mono text-[11px]">{k}</kbd>
              <span className="text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MediaClipPanel({ clip }: { clip: MediaClip }) {
  const media = useEditor((s) => s.project.media.find((m) => m.id === clip.mediaId));
  const track = useEditor((s) => s.project.tracks.find((t) => t.id === clip.trackId));
  const fps = useEditor((s) => s.project.fps);
  const updateClip = useEditor((s) => s.updateClip);
  const pct = Math.round(clip.volume * 100);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="truncate font-medium" title={media?.name}>
          {media?.name ?? "Missing media"}
        </p>
        <p className="text-xs text-muted capitalize">
          {media?.kind} · {track?.name}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs tabular-nums">
        <dt className="text-muted">Start</dt>
        <dd>{formatTime(clip.start, fps)}</dd>
        <dt className="text-muted">End</dt>
        <dd>{formatTime(clipEnd(clip), fps)}</dd>
        <dt className="text-muted">Length</dt>
        <dd>{formatTime(clip.duration, fps)}</dd>
        {media?.kind !== "image" && (
          <>
            <dt className="text-muted">Source in</dt>
            <dd>{formatTime(clip.in, fps)}</dd>
          </>
        )}
      </dl>

      {media?.hasAudio ? (
        <div className="space-y-2">
          <Field label={`Volume · ${pct}%`} htmlFor="clip-volume">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={clip.muted ? "Unmute clip" : "Mute clip"}
                aria-pressed={clip.muted}
                title={clip.muted ? "Unmute clip" : "Mute clip"}
                onClick={() => updateClip(clip.id, { muted: !clip.muted })}
                className={`rounded-md p-1.5 hover:bg-raised ${clip.muted ? "text-danger" : ""}`}
              >
                {clip.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                id="clip-volume"
                type="range"
                min={0}
                max={200}
                step={1}
                value={pct}
                disabled={clip.muted}
                onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) / 100 }, `vol:${clip.id}`)}
                className="min-w-0 flex-1"
              />
            </div>
          </Field>
          {track?.muted && <p className="text-xs text-warn">The track “{track.name}” is muted.</p>}
        </div>
      ) : (
        <p className="text-xs text-muted">{media?.kind === "image" ? "Images have no audio." : "This clip has no audio."}</p>
      )}
    </div>
  );
}
