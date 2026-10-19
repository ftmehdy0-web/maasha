"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/store/editor";
import { restoreLastProject, startAutosave } from "@/lib/persist/hooks";
import { Logo } from "./Logo";
import { useShortcuts } from "./useShortcuts";

import { MediaLibrary } from "./MediaLibrary";
import { Preview } from "./Preview";
import { Notices } from "./Notices";
import { Header } from "./Header";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";

export default function Editor() {
  const [ready, setReady] = useState(false);
  useShortcuts();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let alive = true;
    restoreLastProject().finally(() => {
      if (!alive) return;
      stop = startAutosave();
      setReady(true);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);
  useEffect(() => {
    // Expose the store for debugging and browser tests in development only.
    if (process.env.NODE_ENV === "development") (window as unknown as { __maasha: typeof useEditor }).__maasha = useEditor;
  }, []);
  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center gap-3 text-muted">
        <Logo className="h-7 w-7 animate-pulse" />
        <span>Opening your last project…</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-bg text-fg">
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr_220px] lg:grid-cols-[250px_1fr_280px]">
        <MediaLibrary />
        <Preview />
        <Inspector />
      </div>
      <Timeline />
      <Notices />
    </div>
  );
}
