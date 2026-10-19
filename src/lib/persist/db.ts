// IndexedDB persistence (via idb-keyval). Layout:
//   index            -> ProjectMeta[]       (list for the project picker)
//   last             -> string              (id of the last opened project)
//   project:<id>     -> Project             (plain data)
//   media:<mediaId>  -> Blob                (the imported file itself)

import { createStore, del, delMany, get, keys, set } from "idb-keyval";
import type { Project } from "../types";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
  clipCount: number;
}

let store: ReturnType<typeof createStore> | null = null;
function db() {
  store ??= createStore("maasha", "kv");
  return store;
}

export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  return name === "QuotaExceededError" || /quota/i.test(String((e as Error)?.message ?? ""));
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const list = (await get<ProjectMeta[]>("index", db())) ?? [];
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(p: Project): Promise<void> {
  await set(`project:${p.id}`, p, db());
  const list = (await get<ProjectMeta[]>("index", db())) ?? [];
  const meta: ProjectMeta = {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    clipCount: p.clips.length,
    thumbnail: p.media.find((m) => m.thumbnail)?.thumbnail,
  };
  await set("index", [meta, ...list.filter((m) => m.id !== p.id)], db());
  await set("last", p.id, db());
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return get<Project>(`project:${id}`, db());
}

export async function lastProjectId(): Promise<string | undefined> {
  return get<string>("last", db());
}

export async function deleteProject(id: string): Promise<void> {
  await del(`project:${id}`, db());
  const list = (await get<ProjectMeta[]>("index", db())) ?? [];
  await set("index", list.filter((m) => m.id !== id), db());
  if ((await lastProjectId()) === id) await del("last", db());
}

/**
 * Deletes stored files no saved project references any more (deleted projects,
 * or media removed from a project in an earlier session).
 */
export async function collectGarbage(keepIds: Iterable<string> = []): Promise<void> {
  const used = new Set<string>(keepIds);
  const list = (await get<ProjectMeta[]>("index", db())) ?? [];
  for (const meta of list) {
    const p = await loadProject(meta.id);
    p?.media.forEach((m) => used.add(m.id));
  }
  const all = (await keys(db())) as string[];
  const orphans = all.filter((k) => typeof k === "string" && k.startsWith("media:") && !used.has(k.slice(6)));
  if (orphans.length) await delMany(orphans, db());
}

export async function saveMediaBlob(id: string, blob: Blob): Promise<void> {
  await set(`media:${id}`, blob, db());
}

export async function loadMediaBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(`media:${id}`, db());
}

export async function deleteMediaBlob(id: string): Promise<void> {
  await del(`media:${id}`, db());
}

/** Ask the browser not to evict our storage under pressure (best effort). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    // Not supported; fine.
  }
}
