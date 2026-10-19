"use client";

import { useEffect } from "react";
import { useEditor } from "@/store/editor";

import { MediaLibrary } from "./MediaLibrary";
import { Preview } from "./Preview";
import { Notices } from "./Notices";
import { Header } from "./Header";
import { Timeline } from "./Timeline";

export default function Editor() {
  useEffect(() => {
    // Expose the store for debugging and browser tests in development only.
    if (process.env.NODE_ENV === "development") (window as unknown as { __maasha: typeof useEditor }).__maasha = useEditor;
  }, []);
  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-bg text-fg">
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,240px)_1fr] lg:grid-cols-[260px_1fr]">
        <MediaLibrary />
        <Preview />
      </div>
      <Timeline />
      <Notices />
    </div>
  );
}
