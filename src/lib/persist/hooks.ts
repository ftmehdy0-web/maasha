// Glue between the editor store and IndexedDB: autosave, restore on load,
// switching projects, and storing imported files.

import { useEditor } from "@/store/editor";
import type { Project } from "../types";
import { newProject } from "../timeline/ops";
import { clearRegistry, hasMedia, registerMedia } from "../media/registry";
import * as db from "./db";

const AUTOSAVE_DELAY = 700;

export async function onMediaImported(id: string, blob: Blob): Promise<void> {
  try {
    await db.saveMediaBlob(id, blob);
  } catch (e) {
    const name = (blob as File).name ?? "A file";
    useEditor
      .getState()
      .notify(
        "warning",
        db.isQuotaError(e)
          ? `${name} couldn't be stored in browser storage (quota full). It works now, but you'll need to re-import it after reloading.`
          : `${name} couldn't be saved to browser storage, so you'll need to re-import it after reloading.`,
      );
  }
}

/** Loads a project and registers its stored media. Returns names of missing files. */
async function hydrate(p: Project): Promise<string[]> {
  clearRegistry();
  const missing: string[] = [];
  await Promise.all(
    p.media.map(async (m) => {
      const blob = await db.loadMediaBlob(m.id).catch(() => undefined);
      if (blob) registerMedia(m.id, blob);
      else missing.push(m.name);
    }),
  );
  return missing;
}

export async function openProject(id: string): Promise<boolean> {
  const st = useEditor.getState();
  const p = await db.loadProject(id).catch(() => undefined);
  if (!p) {
    st.notify("error", "That project couldn't be loaded. It may have been deleted or the stored data is damaged.");
    return false;
  }
  const missing = await hydrate(p);
  useEditor.getState().loadProject(p);
  await db.saveProject(p).catch(() => {}); // marks it as last opened
  if (missing.length) {
    st.notify("warning", `Some media files weren't in browser storage: ${missing.join(", ")}. Import the same files again to relink them.`);
  }
  return true;
}

export async function createNewProject(): Promise<void> {
  clearRegistry();
  const p = newProject();
  useEditor.getState().loadProject(p);
  await saveNow();
}

let restoring: Promise<void> | null = null;

/** Opens the last project on startup. Idempotent (React may mount twice in development). */
export function restoreLastProject(): Promise<void> {
  restoring ??= doRestore();
  return restoring;
}

async function doRestore(): Promise<void> {
  try {
    const id = await db.lastProjectId();
    if (!(id && (await openProject(id)))) await saveNow(); // first run: list the fresh project
    await gc();
  } catch {
    useEditor.getState().notify("warning", "Browser storage isn't available, so projects won't be saved (private browsing?).");
  }
}

export async function removeProject(id: string): Promise<void> {
  await db.deleteProject(id);
  if (useEditor.getState().project.id === id) await createNewProject();
  await gc();
}

/** Drops stored files nothing references, always keeping the open project's media. */
function gc(): Promise<void> {
  return db.collectGarbage(useEditor.getState().project.media.map((m) => m.id)).catch(() => {});
}

let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();

export function saveNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = useEditor.getState().project;
  useEditor.setState({ saveState: "saving" });
  // Serialise saves so an older snapshot can never overwrite a newer one.
  saving = saving.then(async () => {
    try {
      await db.saveProject(p);
      if (useEditor.getState().project === p) useEditor.setState({ saveState: "saved" });
    } catch (e) {
      useEditor.setState({ saveState: "error" });
      useEditor
        .getState()
        .notify("error", db.isQuotaError(e) ? "Browser storage is full; the project couldn't be saved." : `Saving failed: ${(e as Error).message}`);
    }
  });
  return saving;
}

/** Starts autosave; returns an unsubscribe function. */
export function startAutosave(): () => void {
  void db.requestPersistence();
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    useEditor.setState({ saveState: "pending" });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY);
  });
  const flush = () => {
    if (timer) void saveNow();
  };
  window.addEventListener("pagehide", flush);
  return () => {
    unsub();
    window.removeEventListener("pagehide", flush);
  };
}

/** If a missing media entry matches this file (name + size), relink it instead of importing a duplicate. */
export function findRelinkTarget(file: File): string | undefined {
  const { project } = useEditor.getState();
  return project.media.find((m) => !hasMedia(m.id) && m.name === file.name && m.size === file.size)?.id;
}
