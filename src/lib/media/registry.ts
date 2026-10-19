// Runtime-only map from media id to its file. Blobs are not part of the store
// (they are not serialisable and must not be copied into undo history).

interface Entry {
  blob: Blob;
  url: string;
}

const entries = new Map<string, Entry>();

export function registerMedia(id: string, blob: Blob): string {
  const existing = entries.get(id);
  if (existing) return existing.url;
  const url = URL.createObjectURL(blob);
  entries.set(id, { blob, url });
  return url;
}

export function getMediaUrl(id: string): string | undefined {
  return entries.get(id)?.url;
}

export function getMediaBlob(id: string): Blob | undefined {
  return entries.get(id)?.blob;
}

export function hasMedia(id: string): boolean {
  return entries.has(id);
}

export function unregisterMedia(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  URL.revokeObjectURL(e.url);
  entries.delete(id);
}

export function clearRegistry(): void {
  for (const id of [...entries.keys()]) unregisterMedia(id);
}
