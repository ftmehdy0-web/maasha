"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, TriangleAlert, X } from "lucide-react";
import { useEditor } from "@/store/editor";
import {
  ExportCancelled,
  checkExportSupport,
  startExport,
  type ExportHandle,
  type ExportProgress,
  type ExportResolution,
  type SupportReport,
} from "@/lib/export";
import { formatBytes, formatTime } from "@/lib/time";
import { projectDuration } from "@/lib/render";
import { Button, Field, inputClass } from "./ui";

type State =
  | { kind: "idle" }
  | { kind: "running"; progress: ExportProgress; started: number; eta: number | null }
  | { kind: "done"; url: string; size: number; name: string; seconds: number }
  | { kind: "error"; message: string };

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const projectName = useEditor((s) => s.project.name);
  const duration = useEditor((s) => projectDuration(s.project));
  const [resolution, setResolution] = useState<ExportResolution>(1080);
  const [name, setName] = useState(() => sanitize(projectName) || "maasha-export");
  const [checked, setChecked] = useState<{ res: ExportResolution; report: SupportReport } | null>(null);
  const support = checked?.res === resolution ? checked.report : null;
  const [state, setState] = useState<State>({ kind: "idle" });
  const [info, setInfo] = useState<string | null>(null);
  const handle = useRef<ExportHandle | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    checkExportSupport(useEditor.getState().project, resolution).then((report) => alive && setChecked({ res: resolution, report }));
    return () => {
      alive = false;
    };
  }, [resolution]);

  // Free the previous download URL when replaced or on close.
  const doneUrl = state.kind === "done" ? state.url : null;
  useEffect(() => () => void (doneUrl && URL.revokeObjectURL(doneUrl)), [doneUrl]);

  useEffect(() => () => handle.current?.cancel(), []);

  const running = state.kind === "running";
  const close = () => {
    if (running) return;
    onClose();
  };

  const start = () => {
    // Pause playback so the preview isn't competing for decoders.
    useEditor.getState().setPlaying(false);
    const project = useEditor.getState().project;
    const started = performance.now();
    setInfo(null);
    setState({ kind: "running", progress: { phase: "audio", value: 0 }, started, eta: null });
    const h = startExport(
      project,
      resolution,
      (p) => {
        // Estimate remaining time once enough has been rendered to be meaningful.
        const elapsed = (performance.now() - started) / 1000;
        const eta = p.value > 0.15 ? elapsed * (1 / p.value - 1) : null;
        setState((s) => (s.kind === "running" ? { ...s, progress: p, eta } : s));
      },
      (i) => setInfo(`${i.videoCodec === "avc" ? "H.264" : i.videoCodec.toUpperCase()}${i.audioCodec ? " + AAC" : ", no audio"}`),
    );
    handle.current = h;
    h.promise
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const file = `${name || "maasha-export"}.mp4`;
        setState({ kind: "done", url, size: blob.size, name: file, seconds: (performance.now() - started) / 1000 });
        triggerDownload(url, file);
      })
      .catch((e: Error) => {
        if (e instanceof ExportCancelled) setState({ kind: "idle" });
        else setState({ kind: "error", message: e.message });
      })
      .finally(() => {
        handle.current = null;
      });
  };

  const pct = state.kind === "running" ? Math.round(state.progress.value * 100) : 0;
  const eta = state.kind === "running" ? state.eta : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          e.stopPropagation(); // keep editor shortcuts out of the dialog
        }}
        className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="export-title" className="text-lg font-semibold">
            Export video
          </h2>
          <button type="button" aria-label="Close export dialog" disabled={running} onClick={close} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <fieldset disabled={running} className="space-y-4">
            <Field label="File name" htmlFor="export-name">
              <div className="flex items-center gap-1">
                <input id="export-name" value={name} onChange={(e) => setName(sanitize(e.target.value))} className={inputClass} autoFocus />
                <span className="text-sm text-muted">.mp4</span>
              </div>
            </Field>
            <div role="radiogroup" aria-label="Resolution" className="grid grid-cols-2 gap-2">
              {([720, 1080] as const).map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer flex-col rounded-lg border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-strong ${
                    resolution === r ? "border-accent bg-accent/10" : "border-line hover:border-muted"
                  }`}
                >
                  <input type="radio" name="resolution" value={r} checked={resolution === r} onChange={() => setResolution(r)} className="sr-only" />
                  <span className="font-semibold">{r}p</span>
                  <span className="text-xs text-muted">
                    {Math.round((r * 16) / 9)}×{r} · 30 fps
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="text-xs text-muted">
            Length {formatTime(duration)} · MP4 (H.264 + AAC). Rendering happens on this device.
          </p>

          {!support && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking browser support…
            </p>
          )}
          {support && support.problems.length > 0 && (
            <div role="alert" className="space-y-1 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
              {support.problems.map((p) => (
                <p key={p} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> {p}
                </p>
              ))}
            </div>
          )}
          {support && support.notes.length > 0 && state.kind !== "done" && (
            <div className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
              {support.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}

          {state.kind === "running" && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex justify-between text-xs">
                <span>
                  {state.progress.phase === "audio" ? "Mixing audio…" : state.progress.phase === "video" ? "Rendering video…" : "Finishing…"}
                  {info && <span className="text-muted"> · {info}</span>}
                </span>
                <span className="tabular-nums">
                  {pct}%{eta !== null && <span className="text-muted"> · ~{Math.ceil(eta)}s left</span>}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Export progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 overflow-hidden rounded-full bg-raised"
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted">Keep this tab open. You can keep editing, but changes won&apos;t be in this export.</p>
            </div>
          )}

          {state.kind === "done" && (
            <div role="status" className="space-y-2 rounded-lg border border-line bg-panel-2 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-[#3ddc97]" aria-hidden /> Export finished
              </p>
              <p className="text-xs text-muted">
                {state.name} · {formatBytes(state.size)} · took {state.seconds.toFixed(1)}s
              </p>
              <a
                href={state.url}
                download={state.name}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-strong"
                data-testid="download-link"
              >
                <Download className="h-4 w-4" aria-hidden /> Download again
              </a>
            </div>
          )}

          {state.kind === "error" && (
            <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
              <p className="font-medium">Export failed</p>
              <p className="mt-1 text-xs">{state.message}</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {running ? (
            <Button variant="danger" onClick={() => handle.current?.cancel()}>
              Cancel export
            </Button>
          ) : (
            <>
              <Button onClick={close}>Close</Button>
              <Button variant="primary" disabled={!support?.ok} onClick={start} data-testid="start-export">
                {state.kind === "done" || state.kind === "error" ? "Export again" : "Export"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80);
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
