"use client";

import { useEditor } from "@/store/editor";
import { Logo } from "./Logo";
import { inputClass } from "./ui";

export function Header() {
  const name = useEditor((s) => s.project.name);
  const renameProject = useEditor((s) => s.renameProject);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-base font-semibold tracking-tight">Maasha</span>
      </div>
      <div className="mx-2 h-5 w-px bg-line" aria-hidden />
      <input
        value={name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Project name"
        className={`${inputClass} max-w-64 border-transparent bg-transparent hover:border-line`}
      />
      <div className="flex-1" />
    </header>
  );
}
