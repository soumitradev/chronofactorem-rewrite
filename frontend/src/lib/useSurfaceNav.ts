import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { defaultDay } from "@/utils/timetableGrid";
import type { TimetableSearch } from "./timetableSearch";
import { useTimetableNav } from "./useTimetableNav";

const resolve = (search: TimetableSearch, dayCount: number) => ({
  view:
    search.view ??
    (window.matchMedia("(max-width: 639px)").matches
      ? ("day" as const)
      : ("week" as const)),
  day: Math.min(search.day ?? defaultDay(dayCount, new Date()), dayCount - 1),
});

export function useSurfaceNav(dayCount: number) {
  const { search, setView, showDay } = useTimetableNav();
  const router = useRouter();
  const { view, day } = resolve(search, dayCount);
  // the latest location, not this render's, so a tap before the last one rendered counts
  const latest = useCallback(
    () => resolve(router.latestLocation.search as TimetableSearch, dayCount),
    [router, dayCount],
  );
  const show = useCallback(
    (d: number) => {
      const cur = latest();
      if (cur.view === "day") {
        if (d === cur.day) return;
        // the swipe scrolls back up from here; read it before a shorter day clamps it
        document.documentElement.style.setProperty(
          "--tt-day-scroll",
          `${window.scrollY}px`,
        );
        return showDay(d, d > cur.day ? "day-next" : "day-prev");
      }
      return showDay(d, "view-morph");
    },
    [latest, showDay],
  );
  const set = useCallback(
    (v: "day" | "week") =>
      setView(v, v === latest().view ? undefined : "view-morph"),
    [latest, setView],
  );
  return useMemo(
    () => ({ view, day, setView: set, showDay: show }),
    [view, day, set, show],
  );
}
