"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEditor } from "@/store/editor";
import { projectDuration, renderFrame } from "@/lib/render";
import { MediaPool } from "@/lib/preview/pool";
import { formatTime } from "@/lib/time";
import { IconButton } from "./ui";

// Preview resolution. Layout is resolution-independent (text scales with height),
// so the preview matches export at any size.
const PW = 1280;
const PH = 720;

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<MediaPool | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    let raf = 0;
    let pending = false;
    // Playback clock: wall-clock time anchored at (anchorWall, anchorT).
    let anchorWall = 0;
    let anchorT = 0;
    let loopT = -1;

    const draw = () => {
      const s = useEditor.getState();
      pool.sync(s.project, s.playhead, s.playing);
      renderFrame(ctx, s.project, s.playhead, PW, PH, pool.getFrame);
    };
    const requestDraw = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!useEditor.getState().playing) draw();
      });
    };
    const pool = new MediaPool(hostRef.current!, requestDraw);
    poolRef.current = pool;

    const tick = () => {
      const s = useEditor.getState();
      if (!s.playing) return;
      const dur = projectDuration(s.project);
      const t = anchorT + (performance.now() - anchorWall) / 1000;
      if (t >= dur) {
        s.setPlaying(false);
        s.setPlayhead(dur);
        return;
      }
      loopT = t;
      s.setPlayhead(t);
      draw();
      raf = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      anchorWall = performance.now();
      anchorT = useEditor.getState().playhead;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const unsub = useEditor.subscribe((s, prev) => {
      if (s.playing !== prev.playing) {
        if (s.playing) {
          pool.resumeAudio(); // runs inside the user's click/keypress
          startLoop();
        } else {
          cancelAnimationFrame(raf);
          pool.pauseAll();
          requestDraw();
        }
        return;
      }
      if (s.playing && s.playhead !== prev.playhead && s.playhead !== loopT) {
        // Someone scrubbed during playback: re-anchor the clock.
        anchorWall = performance.now();
        anchorT = s.playhead;
      }
      if (s.project !== prev.project || s.playhead !== prev.playhead) {
        if (!s.playing) requestDraw();
      }
    });
    requestDraw();

    return () => {
      unsub();
      cancelAnimationFrame(raf);
      pool.dispose();
      poolRef.current = null;
    };
  }, []);

  return (
    <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div className="relative aspect-video max-h-full w-full max-w-full overflow-hidden rounded-md bg-black shadow-lg ring-1 ring-line" style={{ maxWidth: "calc((100vh - 21rem) * 16 / 9)" }}>
          <canvas
            ref={canvasRef}
            width={PW}
            height={PH}
            className="block h-full w-full"
            aria-label="Video preview"
            data-testid="preview-canvas"
          />
        </div>
      </div>
      <div ref={hostRef} aria-hidden className="pointer-events-none fixed top-0 left-0 h-px w-px overflow-hidden opacity-0" />
      <Transport onPlayGesture={() => poolRef.current?.resumeAudio()} />
    </section>
  );
}

function Transport({ onPlayGesture }: { onPlayGesture: () => void }) {
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => projectDuration(s.project));
  const fps = useEditor((s) => s.project.fps);
  const togglePlay = useEditor((s) => s.togglePlay);
  const setPlayhead = useEditor((s) => s.setPlayhead);

  return (
    <div className="flex items-center gap-2 border-t border-line bg-panel px-3 py-1.5">
      <IconButton label="Go to start" onClick={() => setPlayhead(0)}>
        <SkipBack className="h-4 w-4" />
      </IconButton>
      <IconButton
        label={playing ? "Pause" : "Play"}
        shortcut="Space"
        disabled={duration <= 0}
        onClick={() => {
          onPlayGesture();
          togglePlay();
        }}
        className="h-9 min-w-9 bg-raised"
        data-testid="play-button"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </IconButton>
      <IconButton label="Go to end" onClick={() => setPlayhead(duration)}>
        <SkipForward className="h-4 w-4" />
      </IconButton>
      <span className="w-20 text-right font-mono text-xs tabular-nums" data-testid="current-time">
        {formatTime(playhead, fps)}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.001)}
        step={1 / fps}
        value={Math.min(playhead, duration)}
        onChange={(e) => setPlayhead(Number(e.target.value))}
        aria-label="Scrub"
        className="min-w-0 flex-1"
        disabled={duration <= 0}
      />
      <span className="w-20 font-mono text-xs text-muted tabular-nums" data-testid="duration">
        {formatTime(duration, fps)}
      </span>
    </div>
  );
}
