"use client";

import { Info, TriangleAlert, X } from "lucide-react";
import { useEditor } from "@/store/editor";

export function Notices() {
  const notices = useEditor((s) => s.notices);
  const dismiss = useEditor((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-panel-2 p-3 text-sm shadow-xl ${
            n.kind === "error" ? "border-danger/60" : n.kind === "warning" ? "border-warn/50" : "border-line"
          }`}
        >
          {n.kind === "info" ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden />
          ) : (
            <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${n.kind === "error" ? "text-danger" : "text-warn"}`} aria-hidden />
          )}
          <p className="flex-1 leading-snug">{n.text}</p>
          <button
            type="button"
            aria-label="Dismiss message"
            className="rounded p-0.5 text-muted hover:text-fg"
            onClick={() => dismiss(n.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
