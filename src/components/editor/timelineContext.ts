"use client";

import { createContext, useContext } from "react";

export interface TimelineGeometry {
  /** Converts a viewport x coordinate to timeline seconds (unclamped). */
  timeAt: (clientX: number) => number;
  /** Track id under a viewport point, if any. */
  trackAt: (clientX: number, clientY: number) => string | null;
}

export const TimelineCtx = createContext<TimelineGeometry | null>(null);

export function useTimelineGeometry(): TimelineGeometry {
  const g = useContext(TimelineCtx);
  if (!g) throw new Error("useTimelineGeometry outside <Timeline>");
  return g;
}

export const HEADER_W = 176;
export const TRACK_H = { video: 60, audio: 46, text: 38 } as const;
export const SNAP_PX = 8;
