import type { ParsedLocation } from "@tanstack/react-router";

// resolved only in the morphing transitions: named elements paint above the page,
// so naming them always would draw over the phone sheet or the copying dialog
export const TIMETABLE_TITLE_VT = "var(--vt-timetable-title)";
export const TIMETABLE_GRID_VT = "var(--vt-timetable-grid)";

let sharedId: string | null = null;
const listeners = new Set<() => void>();

export function setSharedTimetable(id: string | null): void {
  if (id === sharedId) return;
  sharedId = id;
  for (const listener of listeners) listener();
}

export function getSharedTimetable(): string | null {
  return sharedId;
}

export function subscribeSharedTimetable(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const timetableId = (location: ParsedLocation | undefined) =>
  location?.pathname.match(/^\/(?:edit|view|finalize)\/([^/]+)\/?$/)?.[1] ??
  null;

// must run on onBeforeNavigate, before the old snapshot is taken
export function trackSharedTimetable(info: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
}): void {
  const { fromLocation, toLocation } = info;
  setSharedTimetable(
    toLocation.pathname === "/"
      ? timetableId(fromLocation)
      : fromLocation?.pathname === "/"
        ? timetableId(toLocation)
        : null,
  );
}
