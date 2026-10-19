"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useEditor } from "@/store/editor";
import { Logo } from "./Logo";
import { Button, inputClass } from "./ui";
import { ExportDialog } from "./ExportDialog";
import { ProjectMenu, SaveStatus } from "./ProjectMenu";

export function Header() {
  const name = useEditor((s) => s.project.name);
  const renameProject = useEditor((s) => s.renameProject);
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-base font-semibold tracking-tight">Maasha</span>
      </div>
      <div className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ProjectMenu />
      <input
        value={name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Project name"
        className={`${inputClass} max-w-64 border-transparent bg-transparent hover:border-line`}
      />
      <SaveStatus />
      <div className="flex-1" />
      <Button variant="primary" disabled={!hasClips} onClick={() => setExportOpen(true)} data-testid="open-export">
        <Download className="h-4 w-4" aria-hidden /> Export
      </Button>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </header>
  );
}
