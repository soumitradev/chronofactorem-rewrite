import {
  type HistoryState,
  useNavigate,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { TimetableSearch } from "./timetableSearch";
import { matchesDesktop } from "./useIsDesktop";
import {
  markSheetClosing,
  prefersReducedMotion,
  type SurfaceTransition,
  supportsTransitionTypes,
} from "./viewTransitions";

type SectionType = "L" | "P" | "T";

const stripSheet = ({
  sheet: _s,
  course: _c,
  type: _t,
  q: _q,
  ...rest
}: TimetableSearch): TimetableSearch => rest;

const stripCourse = ({
  course: _c,
  type: _t,
  ...rest
}: TimetableSearch): TimetableSearch => rest;

export function useTimetableNav() {
  const search = useSearch({ strict: false }) as TimetableSearch;
  const navigate = useNavigate();
  const router = useRouter();

  const go = useCallback(
    async (
      update: (prev: TimetableSearch) => TimetableSearch,
      opts: { push: boolean; transition?: SurfaceTransition },
    ) => {
      let state: HistoryState | true = true;
      if (opts.push) {
        const cur = router.latestLocation;
        const curSearch = cur.search as TimetableSearch;
        const next = update(curSearch);
        state = next.sheet
          ? {
              chronoNav: true,
              sheetDepth: curSearch.sheet ? (cur.state.sheetDepth ?? 0) + 1 : 1,
              sheetDeepRoot: curSearch.sheet
                ? cur.state.sheetDepth
                  ? cur.state.sheetDeepRoot
                  : true
                : undefined,
            }
          : { chronoNav: true };
      }
      await navigate({
        to: ".",
        search: (prev) => update(prev as TimetableSearch),
        resetScroll: false,
        state,
        // only history pops use the router default, so nothing transitions twice
        viewTransition:
          opts.transition &&
          !prefersReducedMotion() &&
          supportsTransitionTypes()
            ? { types: [opts.transition] }
            : false,
        ...(opts.push ? {} : { replace: true }),
      });
    },
    [navigate, router],
  );

  const back = useCallback(
    (
      strip: (prev: TimetableSearch) => TimetableSearch,
      transition?: SurfaceTransition,
    ) => {
      if (router.latestLocation.state.chronoNav) {
        router.history.back();
      } else {
        go(strip, { push: false, transition });
      }
    },
    [router, go],
  );

  return useMemo(() => {
    // phone tabs and courses live in the courses sheet, so this pushes it if closed
    const coursesSheet = () => {
      const phone = !matchesDesktop();
      return {
        phone,
        sheet: phone ? { sheet: "courses" as const } : {},
        closed: phone && router.latestLocation.search.sheet !== "courses",
      };
    };

    return {
      search,
      openSheet: (sheet: "courses" | "warnings") => {
        if (router.latestLocation.search.sheet === sheet) return;
        if (sheet === "warnings" && !matchesDesktop()) {
          return go(
            ({ course: _c, type: _t, q: _q, ...p }) => ({ ...p, sheet }),
            { push: true },
          );
        }
        return go((p) => ({ ...p, sheet }), { push: true });
      },
      closeSheet: () => {
        const loc = router.latestLocation;
        const { sheetDepth, sheetDeepRoot } = loc.state;
        if (!sheetDepth || !loc.search.sheet) {
          back(stripSheet);
          return;
        }
        if (sheetDeepRoot) {
          // the landing entry was deep-linked with the sheet open; strip it once resolved
          let timer: ReturnType<typeof setTimeout> | undefined;
          const unsub = router.subscribe("onResolved", () => {
            clearTimeout(timer);
            unsub();
            go(stripSheet, { push: false });
          });
          // never leave a stray listener, or a URL claiming a closed sheet
          timer = setTimeout(() => {
            unsub();
            if (router.latestLocation.search.sheet)
              go(stripSheet, { push: false });
          }, 1000);
          markSheetClosing();
        }
        router.history.go(-sheetDepth);
      },
      setTab: (tab: NonNullable<TimetableSearch["tab"]>) =>
        go((p) => ({ ...p, tab }), { push: false }),
      setExam: (exam: "midsem" | "compre") =>
        go((p) => ({ ...p, exam }), { push: false }),
      showTab: async (
        tab: NonNullable<TimetableSearch["tab"]>,
        transition?: SurfaceTransition,
      ) => {
        const { sheet, closed } = coursesSheet();
        // pushed from no sheet or from warnings, so back returns there
        await go((p) => ({ ...stripCourse(p), tab, ...sheet }), {
          push: closed,
          transition,
        });
      },
      openCourse: async (
        courseId: string,
        opts: { type?: SectionType; transition?: SurfaceTransition } = {},
      ) => {
        const { type, transition } = opts;
        const { phone, sheet, closed } = coursesSheet();
        // no `type` shows the default type, or the current one if this course is open
        const update = (p: TimetableSearch): TimetableSearch => ({
          ...p,
          course: courseId,
          type: type ?? (p.course === courseId ? p.type : undefined),
          ...sheet,
        });
        // same course: switch type in place, so back returns to the previous course
        if (router.latestLocation.search.course === courseId && !closed) {
          await go(update, { push: false, transition });
          return;
        }
        // a closed sheet pushes the list first so back returns to it; over warnings, push straight on top
        if (phone && !router.latestLocation.search.sheet)
          await go((p) => ({ ...stripCourse(p), sheet: "courses" }), {
            push: true,
          });
        await go(update, { push: true, transition });
      },
      closeCourse: () => back(stripCourse, "panel-back"),
      setType: (type: SectionType) =>
        go((p) => ({ ...p, type }), { push: false }),
      setView: (view: "day" | "week", transition?: SurfaceTransition) =>
        go((p) => ({ ...p, view }), { push: false, transition }),
      showDay: (day: number, transition?: SurfaceTransition) =>
        go((p) => ({ ...p, view: "day" as const, day }), {
          push: false,
          transition,
        }),
      setQuery: (q: string) =>
        go(({ q: _q, ...rest }) => (q ? { ...rest, q } : rest), {
          push: false,
        }),
    };
  }, [search, go, back, router]);
}
