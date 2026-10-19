"use client";

import dynamic from "next/dynamic";
import { Logo } from "./Logo";

// The editor depends on browser-only APIs (canvas, WebCodecs, IndexedDB), so it is never server-rendered.
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-3 text-muted">
      <Logo className="h-7 w-7 animate-pulse" />
      <span>Loading Maasha…</span>
    </div>
  ),
});

export default function ClientEditor() {
  return <Editor />;
}
