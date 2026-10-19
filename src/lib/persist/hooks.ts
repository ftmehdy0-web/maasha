// Persistence hook points; filled in by the project store (stage 6).
export async function onMediaImported(id: string, blob: Blob): Promise<void> {
  void id;
  void blob;
}
