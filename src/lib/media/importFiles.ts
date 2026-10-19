import { useEditor } from "@/store/editor";
import { ImportError, probeFile } from "./import";
import { registerMedia } from "./registry";
import { onMediaImported } from "../persist/hooks";

/** Validates, registers and adds files to the library, reporting problems as notices. */
export async function importFiles(files: Iterable<File>): Promise<void> {
  const st = useEditor.getState();
  for (const file of files) {
    st.setImporting(1);
    try {
      const { asset, warnings } = await probeFile(file);
      registerMedia(asset.id, file);
      useEditor.getState().addMedia(asset);
      for (const w of warnings) st.notify("warning", w);
      await onMediaImported(asset.id, file);
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : `Unexpected error: ${(e as Error).message}`;
      st.notify("error", `Couldn't import “${file.name}”. ${msg}`);
      if (!(e instanceof ImportError)) console.warn(e);
    } finally {
      st.setImporting(-1);
    }
  }
}
