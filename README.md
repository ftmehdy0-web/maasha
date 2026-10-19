# Maasha

A fast, private video editor that runs entirely in the browser. Import clips, arrange them on a multi-track timeline, add text, and export an MP4. Nothing is uploaded: decoding, rendering and encoding all happen on your device.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Zustand and [mediabunny](https://mediabunny.dev) (WebCodecs demux/decode/encode/mux).

## Setup

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000/editor
```

Production build:

```bash
npm run build
npm start            # http://localhost:3000/editor
```

`/` redirects to `/editor`.

## Features

- **Import** video, audio and images via drag and drop or the file picker. Each file is probed first, and files that would fail later are rejected with a reason: unsupported type, damaged container, a codec this browser can't decode (e.g. HEVC), HEIC photos. You also get warnings for very large files, HDR, and audio that can't be decoded.
- **Preview** on a canvas with play/pause, scrubbing, current time and duration. Audio from video clips and audio tracks plays in sync.
- **Timeline**:
  - Multiple video, audio and text tracks. Drag from the library, or use **+** on a library item.
  - Move clips, including across compatible tracks. Trim either edge, split at the playhead, delete.
  - Snapping to the playhead and clip edges, which can be turned off.
  - Zoom with the buttons, the slider, Ctrl/⌘ + mouse wheel, or *fit*. The playhead is draggable.
- **Text overlays**: content, font, size, colour, position (drag on the preview, which snaps to centre), and start/end times.
- **Audio**: per-clip volume (0–200%) and mute, plus per-track mute.
- **Export**:
  - MP4 (H.264 + AAC) at 720p or 1080p, 30 fps.
  - A progress bar with time remaining, and a cancel button.
  - A capability check before you start that explains anything missing.
- **Projects**:
  - Saved in IndexedDB together with their media files. Autosave runs after each change, and the last project reopens on load.
  - The Projects menu creates, opens and deletes projects.
  - Undo/redo keeps 100 steps.
- **Keyboard shortcuts**:
  - `Space` play/pause, `S` split, `Delete`/`Backspace` remove
  - `Ctrl/⌘+Z` undo, `Ctrl/⌘+Shift+Z` (or `Ctrl+Y`) redo
  - `←`/`→` step one frame, `Shift+←/→` one second
  - `Ctrl/⌘+S` save now, `Esc` deselect

## Architecture

```
src/
  app/editor/page.tsx        route; renders the client-only editor
  store/editor.ts            single Zustand store: project, selection, playhead, zoom, history
  lib/types.ts               plain-data model (Project, Track, MediaClip, TextClip, …)
  lib/timeline/ops.ts        pure timeline operations (add, move, trim, split, snap, …)
  lib/render/index.ts        renderFrame(ctx, project, t, …): the shared compositor
  lib/preview/pool.ts        drives <video>/<audio> elements for live preview
  lib/export/                audio mix (OfflineAudioContext) + export worker (WebCodecs)
  lib/media/                 import/probing and the runtime blob registry
  lib/persist/               IndexedDB storage, autosave, restore, relinking
  components/editor/         MediaLibrary, Preview, Timeline, Track, Clip, Toolbar,
                             Inspector, TextEditor, TextOverlay, ExportDialog, …
```

- **The timeline is plain data.** The store holds a serialisable `Project`. Undo/redo stores snapshots of it. A drag or trim records one undo step, and typing within 0.8 s is merged into one step.
- **One renderer.** `renderFrame` is a pure function of `(project, t)` that draws onto any 2D context. The preview calls it with frames from `<video>` elements. The export worker calls it on an `OffscreenCanvas` with frames decoded by WebCodecs. Text is laid out relative to frame height, so 720p, 1080p and the preview all match.
- **Export pipeline:**
  1. The main thread decodes only the used range of each audible clip and mixes everything with `OfflineAudioContext` (48 kHz stereo).
  2. A module **Web Worker** decodes source frames, renders each output frame, and encodes H.264 + AAC into MP4 with mediabunny. The UI stays responsive.
  3. Cancelling terminates the worker.
  4. If the browser has no native AAC encoder (Firefox, Chromium on Linux), a WASM AAC encoder (`@mediabunny/aac-encoder`) is used instead. If H.264 encoding is unavailable, the export falls back to VP9/AV1 in MP4 and tells you so.

## Testing

```bash
npm test             # unit tests for the timeline operations (Vitest)
npm run lint
npm run build        # includes a full TypeScript check
```

Manual checklist (Chrome or Edge recommended):

1. **Import:** open `/editor` and drop a video, an MP3/WAV and a PNG on the Media panel. Also try a `.txt` file and a renamed non-video `.mp4`; both should show a clear error.
2. **Timeline:** drag the video onto *Video 1*, the audio onto *Audio 1*. Press Space to play.
3. **Editing:** drag a clip and watch it snap to the playhead (yellow guide). Trim both edges. Put the playhead inside a clip, select it and press `S`, then `Delete`, then `Ctrl+Z` and `Ctrl+Shift+Z`.
4. **Layers:** add a second video track (**+ Track**), drop a clip on it, and check it draws on top. Move a track with the arrows in its header.
5. **Audio:** select the audio clip, set volume to 150%, then mute the audio track. You should hear the difference.
6. **Text:** click **T** (add text), type, change font/size/colour, and drag it on the preview.
7. **Persistence:** reload the page. The project, including media, should come back. Try *Projects → New project* and switch back.
8. **Export:** click **Export**, choose 720p, export, then cancel one and export again at 1080p. Open the MP4 in a player and check picture, text and audio.

In development the store is exposed as `window.__maasha` and the preview pool as `window.__maashaPool`, for debugging and browser automation. They're absent in production builds.

## Browser support

Development and automated testing used Chromium 150 on Linux. The other rows are what the underlying APIs should support, but they are untested.

| | Editing & preview | Export |
|---|---|---|
| Chrome / Edge 113+ (desktop) | ✅ | ✅ H.264 + AAC (WASM AAC fallback on Linux) |
| Safari 17+ (macOS / iPadOS) | ✅ | ✅ |
| Firefox 130+ (desktop) | ✅ | ✅ where the OS provides an H.264 encoder; otherwise VP9-in-MP4 |
| Older browsers | Import works where `<video>` can play the file | ❌ The dialog explains what's missing |

## iPhone videos

iPhones record **HEVC (H.265)** by default ("High Efficiency"), often HDR (Dolby Vision/HLG), with rotation metadata for portrait shots.

- **HEVC decoding** depends on browser, OS and hardware. Safari on macOS/iPadOS: yes. Chrome/Edge on macOS: usually (hardware decoding). Chrome/Edge on Windows: only with hardware support (plus the HEVC Video Extensions on some setups). Linux: generally no. Maasha checks this on import and refuses the file with instructions, instead of producing a black video.
- To avoid the issue, record with **Settings → Camera → Formats → Most Compatible** (H.264). When copying to a computer by cable, **Settings → Photos → Transfer to Mac or PC → Automatic** converts files to compatible formats.
- **Portrait videos** are rotated correctly in both preview and export. They are letterboxed in the 16:9 frame.
- **HDR** footage is exported as SDR. Colours can look flatter or washed out.

## Known limitations

- The canvas is fixed at 16:9 (there are no vertical/square project presets), and export is always 30 fps. Clips are fitted with letterboxing. There is no crop, zoom or rotate per clip.
- **Preview vs. export timing:** preview follows the wall clock and re-syncs media that drifts more than 0.25 s. Export is frame-accurate. On slow machines, preview may stutter while export stays correct.
- **Memory:** export keeps the finished MP4 in memory, and the audio mix uses about 23 MB per minute. Very long 1080p projects (roughly 30+ minutes) may run out of memory. Use 720p or split the project.
- **Storage:** imported files are copied into IndexedDB so projects survive reloads. Large files can exceed the browser quota. You'll get a warning, and after a reload you'll need to re-import them; the same file is relinked automatically by name and size. Undo history isn't saved across reloads.
- **Fonts** are limited to common system fonts, so preview (main thread) and export (worker) render the same typeface.
- **Audio clips** show a decorative stripe, not a real waveform.
- **Touch:** dragging from the library uses HTML5 drag and drop, which doesn't work with touch. On tablets use the **+** button on a library item. Everything on the timeline works with touch.
- No effects, filters, transitions, speed changes or keyframes (out of scope for the MVP).
