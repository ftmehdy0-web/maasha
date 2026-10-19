"use client";

import { useEffect } from "react";
import { useEditor } from "@/store/editor";
import { saveNow } from "@/lib/persist/hooks";

/** True when the key should go to a form control instead of the editor. */
function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "INPUT") {
    const type = (t as HTMLInputElement).type;
    return !["range", "checkbox", "radio", "button", "color"].includes(type);
  }
  return tag === "TEXTAREA" || tag === "SELECT";
}

/** Range inputs keep their native arrow-key behaviour. */
const isRange = (t: EventTarget | null) => t instanceof HTMLInputElement && t.type === "range";

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;

      // Undo/redo/save work everywhere except inside text fields, where the
      // browser's own undo for the field is more useful.
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "s") {
          e.preventDefault();
          void saveNow();
          return;
        }
        if (isTyping(e.target)) return;
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          st.undo();
        } else if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          st.redo();
        }
        return;
      }
      if (isTyping(e.target) || e.altKey) return;

      switch (e.key) {
        case " ":
          // Also stops Space from "clicking" a focused button.
          e.preventDefault();
          st.togglePlay();
          break;
        case "s":
        case "S":
          e.preventDefault();
          st.splitAtPlayhead();
          break;
        case "Delete":
        case "Backspace":
          if (st.selectedId) {
            e.preventDefault();
            st.deleteSelected();
          }
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          if (isRange(e.target)) return;
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          st.stepFrames(dir * (e.shiftKey ? st.project.fps : 1));
          break;
        }
        case "Escape":
          st.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
