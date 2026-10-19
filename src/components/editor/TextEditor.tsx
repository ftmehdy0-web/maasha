"use client";

import { useState } from "react";
import { useEditor } from "@/store/editor";
import type { TextClip } from "@/lib/types";
import { FONTS, clipEnd } from "@/lib/types";
import * as ops from "@/lib/timeline/ops";
import { Field, inputClass } from "./ui";

const SWATCHES = ["#ffffff", "#000000", "#ffd84d", "#ff5d6c", "#7c5cff", "#3ddc97", "#4db8ff"];

export function TextEditor({ clip }: { clip: TextClip }) {
  const updateClip = useEditor((s) => s.updateClip);
  const commit = useEditor((s) => s.commit);
  const id = clip.id;
  const fontKnown = FONTS.some((f) => f.value === clip.font);

  return (
    <div className="space-y-4">
      <Field label="Text" htmlFor="text-content">
        <textarea
          id="text-content"
          value={clip.text}
          rows={3}
          onChange={(e) => updateClip(id, { text: e.target.value }, `text:${id}`)}
          className={`${inputClass} h-auto resize-y py-1.5 leading-snug`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Font" htmlFor="text-font">
          <select
            id="text-font"
            value={clip.font}
            onChange={(e) => updateClip(id, { font: e.target.value })}
            className={inputClass}
          >
            {!fontKnown && <option value={clip.font}>Custom</option>}
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size" htmlFor="text-size">
          <NumberInput
            id="text-size"
            value={clip.size}
            min={8}
            max={400}
            step={1}
            onCommit={(v) => updateClip(id, { size: v })}
          />
        </Field>
      </div>

      <Field label="Colour" htmlFor="text-color">
        <div className="flex items-center gap-1.5">
          <input
            id="text-color"
            type="color"
            value={clip.color}
            onChange={(e) => updateClip(id, { color: e.target.value }, `color:${id}`)}
            className="h-8 w-10 cursor-pointer rounded-md border border-line bg-panel-2 p-0.5"
          />
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              title={c}
              onClick={() => updateClip(id, { color: c })}
              className={`h-6 w-6 rounded-full border ${clip.color.toLowerCase() === c ? "border-accent-strong ring-2 ring-accent" : "border-line"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X position (%)" htmlFor="text-x">
          <NumberInput id="text-x" value={round(clip.x * 100)} min={0} max={100} step={1} onCommit={(v) => updateClip(id, { x: v / 100 })} />
        </Field>
        <Field label="Y position (%)" htmlFor="text-y">
          <NumberInput id="text-y" value={round(clip.y * 100)} min={0} max={100} step={1} onCommit={(v) => updateClip(id, { y: v / 100 })} />
        </Field>
      </div>
      <p className="-mt-2 text-[11px] text-muted">Tip: drag the text on the preview to position it.</p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)" htmlFor="text-start">
          <NumberInput
            id="text-start"
            value={round(clip.start, 2)}
            min={0}
            step={0.1}
            onCommit={(v) => commit((p) => ops.moveClip(p, id, clip.trackId, v))}
          />
        </Field>
        <Field label="End (s)" htmlFor="text-end">
          <NumberInput
            id="text-end"
            value={round(clipEnd(clip), 2)}
            min={0}
            step={0.1}
            onCommit={(v) => commit((p) => ops.trimClip(p, id, "end", v))}
          />
        </Field>
      </div>
    </div>
  );
}

function round(v: number, digits = 0) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Number field that only commits on blur/Enter, so typing doesn't create intermediate undo steps. */
function NumberInput({
  id,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (!Number.isFinite(v)) return;
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
  };
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={draft ?? String(value)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") setDraft(null);
      }}
      className={`${inputClass} tabular-nums`}
    />
  );
}
