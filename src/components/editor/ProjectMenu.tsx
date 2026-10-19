"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePlus, FolderOpen, Trash2 } from "lucide-react";
import { useEditor } from "@/store/editor";
import { listProjects, type ProjectMeta } from "@/lib/persist/db";
import { createNewProject, openProject, removeProject, saveNow } from "@/lib/persist/hooks";

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const currentId = useEditor((s) => s.project.id);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = async () => {
    if (!open) {
      await saveNow(); // so the current project's entry is up to date
      refresh();
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg/90 hover:bg-raised"
      >
        <FolderOpen className="h-4 w-4" aria-hidden /> Projects <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Projects" className="absolute top-10 left-0 z-50 w-80 rounded-lg border border-line bg-panel-2 p-1.5 shadow-2xl">
          <button
            role="menuitem"
            type="button"
            autoFocus
            onClick={async () => {
              setOpen(false);
              await createNewProject();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-raised"
          >
            <FilePlus className="h-4 w-4 text-accent-strong" aria-hidden /> New project
          </button>
          <div className="my-1 h-px bg-line" />
          <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Saved in this browser</p>
          <ul className="scrollbar-thin max-h-72 overflow-y-auto">
            {projects === null && <li className="px-2 py-2 text-xs text-muted">Loading…</li>}
            {projects?.length === 0 && <li className="px-2 py-2 text-xs text-muted">No saved projects yet.</li>}
            {projects?.map((p) => (
              <li key={p.id} className="group flex items-center gap-1 rounded-md hover:bg-raised">
                <button
                  role="menuitem"
                  type="button"
                  onClick={async () => {
                    setOpen(false);
                    if (p.id !== currentId) await openProject(p.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span className="h-8 w-14 shrink-0 overflow-hidden rounded bg-black/40">
                    {p.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
                      <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {p.name || "Untitled"} {p.id === currentId && <span className="text-xs text-accent-strong">(open)</span>}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} · {new Date(p.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete project ${p.name || "Untitled"}`}
                  title="Delete project"
                  onClick={async () => {
                    if (!confirm(`Delete “${p.name || "Untitled"}” and its stored media? This can't be undone.`)) return;
                    await removeProject(p.id);
                    refresh();
                  }}
                  className="mr-1 rounded p-1.5 text-muted opacity-100 hover:text-danger md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SaveStatus() {
  const state = useEditor((s) => s.saveState);
  const text = { idle: "", pending: "Unsaved changes", saving: "Saving…", saved: "All changes saved", error: "Save failed" }[state];
  return (
    <span role="status" className={`hidden text-xs md:inline ${state === "error" ? "text-danger" : "text-muted"}`} data-testid="save-status">
      {text}
    </span>
  );
}
