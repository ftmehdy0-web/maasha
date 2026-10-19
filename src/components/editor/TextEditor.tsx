"use client";

import type { TextClip } from "@/lib/types";

/** Placeholder until stage 4. */
export function TextEditor({ clip }: { clip: TextClip }) {
  return <p className="text-xs text-muted">{clip.text}</p>;
}
