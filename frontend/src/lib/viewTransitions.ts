import type { ParsedLocation } from "@tanstack/react-router";
import { timetableId } from "./sharedTransition";
import type { TimetableSearch } from "./timetableSearch";

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const supportsTransitionTypes = () =>
  typeof document.startViewTransition === "function" &&
  typeof ViewTransition !== "undefined" &&
  "types" in ViewTransition.prototype &&
  CSS.supports("selector(:active-view-transition-type(a))");

const tsrIndex = (location: ParsedLocation) =>
  (location.state as { __TSR_index?: number }).__TSR_index ?? 0;

// a sheet opening or closing is the sheet's own motion, so only a course
// change or one sheet replacing another slides the panel
export const panelMoved = (a: TimetableSearch, b: TimetableSearch): boolean => {
  if (!!a.sheet !== !!b.sheet) return false;
  return (
    (a.course ?? null) !== (b.course ?? null) ||
    (!!a.sheet && a.sheet !== b.sheet)
  );
};

let sheetClosePending = false;

// the next history pop closes the sheet, so it mustn't slide the course panel
// under the sheet's own exit
export function markSheetClosing(): void {
  sheetClosePending = true;
  setTimeout(() => {
    sheetClosePending = false;
  }, 1000);
}

// the router default, so only route changes and history pops land here. a
// different timetable (a fresh copy) replaces the page whole instead of morphing
export function routeTransitionTypes(info: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
  pathChanged: boolean;
}): string[] | false {
  if (!info.fromLocation) return false;
  if (prefersReducedMotion()) return false;
  const back = tsrIndex(info.toLocation) < tsrIndex(info.fromLocation);
  if (!info.pathChanged) {
    if (sheetClosePending) {
      sheetClosePending = false;
      return false;
    }
    if (
      !panelMoved(
        info.fromLocation.search as TimetableSearch,
        info.toLocation.search as TimetableSearch,
      )
    )
      return false;
    return back ? ["panel-back"] : ["panel-forward"];
  }
  document.documentElement.toggleAttribute(
    "data-navbar-still",
    window.scrollY === 0,
  );
  const from = timetableId(info.fromLocation);
  const to = timetableId(info.toLocation);
  const types = back ? ["back"] : ["forward"];
  if (!from || !to || from === to) types.push("shared-timetable");
  return types;
}

// the navbar holds still only while it sits at the top of both pages, or it
// would jump; runs once the new page restores its scroll, before its snapshot
export function releaseStillNavbar(): void {
  if (window.scrollY !== 0)
    document.documentElement.removeAttribute("data-navbar-still");
}

export function startThemeTransition(
  apply: () => void,
  origin: { x: number; y: number },
): void {
  if (!document.startViewTransition || prefersReducedMotion()) {
    apply();
    return;
  }
  const root = document.documentElement;
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  root.style.setProperty("--rx", `${origin.x}px`);
  root.style.setProperty("--ry", `${origin.y}px`);
  root.style.setProperty("--rr", `${radius}px`);
  root.classList.add("theme-transition");
  const transition = document.startViewTransition(apply);
  const cleanup = () => {
    root.classList.remove("theme-transition");
    for (const name of ["--rx", "--ry", "--rr"])
      root.style.removeProperty(name);
  };
  transition.finished.then(cleanup, cleanup);
}

export type SurfaceTransition =
  | "day-next"
  | "day-prev"
  | "view-morph"
  | "orient"
  | "panel-forward"
  | "panel-back";

// `update` must commit the DOM synchronously (wrap React state in flushSync)
export function startSurfaceTransition(
  type: SurfaceTransition,
  update: () => void,
): void {
  if (prefersReducedMotion() || !supportsTransitionTypes()) {
    update();
    return;
  }
  const transition = document.startViewTransition({ update, types: [type] });
  // a newer transition skips this one
  transition.ready.catch(() => {});
}
