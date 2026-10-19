"use client";

import { MediaLibrary } from "./MediaLibrary";
import { Preview } from "./Preview";
import { Notices } from "./Notices";
import { Header } from "./Header";

export default function Editor() {
  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-bg text-fg">
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,240px)_1fr] lg:grid-cols-[260px_1fr]">
        <MediaLibrary />
        <Preview />
      </div>
      <Notices />
    </div>
  );
}
