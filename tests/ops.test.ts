import { describe, expect, it } from "vitest";
import * as ops from "@/lib/timeline/ops";
import type { MediaAsset, MediaClip, Project } from "@/lib/types";

function media(id: string, kind: MediaAsset["kind"], duration: number): MediaAsset {
  return { id, name: id, kind, mime: "", size: 1, duration, width: 1280, height: 720, hasAudio: kind !== "image" };
}

function setup(): Project {
  const p = ops.newProject();
  return { ...p, media: [media("v", "video", 10), media("a", "audio", 20), media("i", "image", Infinity)] };
}

const videoTrack = (p: Project) => p.tracks.find((t) => t.kind === "video")!.id;
const get = (p: Project, id: string) => p.clips.find((c) => c.id === id) as MediaClip;

describe("timeline ops", () => {
  it("adds media to a compatible track at the requested time", () => {
    const r = ops.addMediaClip(setup(), "a", 2);
    const t = r.project.tracks.find((x) => x.id === r.clip!.trackId)!;
    expect(t.kind).toBe("audio");
    expect(r.clip!.start).toBe(2);
    expect(r.clip!.duration).toBe(20);
  });

  it("gives images a default duration", () => {
    const r = ops.addMediaClip(setup(), "i", 0);
    expect(r.clip!.duration).toBe(5);
  });

  it("never overlaps clips on the same track", () => {
    let p = setup();
    const a = ops.addMediaClip(p, "v", 0);
    p = a.project;
    const b = ops.addMediaClip(p, "v", 3);
    expect(b.clip!.start).toBe(10); // pushed after the first clip
  });

  it("moves clips and resolves collisions to the nearest free spot", () => {
    let p = setup();
    const a = ops.addMediaClip(p, "v", 0);
    const b = ops.addMediaClip(a.project, "v", 20);
    p = ops.trimClip(b.project, b.clip!.id, "end", 22); // b: 20..22
    p = ops.moveClip(p, b.clip!.id, videoTrack(p), 9); // overlaps a (0..10)
    expect(get(p, b.clip!.id).start).toBe(10);
  });

  it("refuses to move a clip onto an incompatible track", () => {
    let p = setup();
    const a = ops.addMediaClip(p, "v", 0);
    p = a.project;
    const audio = p.tracks.find((t) => t.kind === "audio")!.id;
    p = ops.moveClip(p, a.clip!.id, audio, 4);
    expect(get(p, a.clip!.id).trackId).toBe(videoTrack(p));
    expect(get(p, a.clip!.id).start).toBe(4);
  });

  it("trims the start and shifts the source in-point", () => {
    const a = ops.addMediaClip(setup(), "v", 5);
    const p = ops.trimClip(a.project, a.clip!.id, "start", 7);
    const c = get(p, a.clip!.id);
    expect(c.start).toBe(7);
    expect(c.in).toBe(2);
    expect(c.duration).toBe(8);
  });

  it("does not trim beyond the source media", () => {
    const a = ops.addMediaClip(setup(), "v", 5);
    let p = ops.trimClip(a.project, a.clip!.id, "start", 1);
    expect(get(p, a.clip!.id).start).toBe(5);
    p = ops.trimClip(p, a.clip!.id, "end", 100);
    expect(get(p, a.clip!.id).duration).toBe(10);
  });

  it("does not trim into a neighbour", () => {
    let p = setup();
    const a = ops.addMediaClip(p, "i", 0); // 0..5
    const b = ops.addMediaClip(a.project, "i", 8); // 8..13
    p = ops.trimClip(b.project, a.clip!.id, "end", 20);
    expect(get(p, a.clip!.id).duration).toBe(8);
    p = ops.trimClip(p, b.clip!.id, "start", 2);
    expect(get(p, b.clip!.id).start).toBe(8);
  });

  it("splits into two contiguous clips with correct in-points", () => {
    const a = ops.addMediaClip(setup(), "v", 2);
    const r = ops.splitClip(a.project, a.clip!.id, 6);
    const left = get(r.project, a.clip!.id);
    const right = get(r.project, r.rightId!);
    expect(left.duration).toBe(4);
    expect(right.start).toBe(6);
    expect(right.in).toBe(4);
    expect(right.duration).toBe(6);
  });

  it("ignores splits at the very edge of a clip", () => {
    const a = ops.addMediaClip(setup(), "v", 2);
    expect(ops.splitClip(a.project, a.clip!.id, 2).project).toBe(a.project);
  });

  it("snaps to the nearest candidate within the threshold", () => {
    expect(ops.snapTime(4.95, [0, 5, 10], 0.1)).toEqual({ t: 5, snapped: 5 });
    expect(ops.snapTime(4.5, [0, 5, 10], 0.1)).toEqual({ t: 4.5, snapped: null });
  });

  it("creates a track when none of the right kind exists", () => {
    let p = setup();
    p = ops.removeTrack(p, p.tracks.find((t) => t.kind === "audio")!.id);
    const r = ops.addMediaClip(p, "a", 0);
    expect(r.project.tracks.filter((t) => t.kind === "audio")).toHaveLength(1);
  });
});
