import {
  defaultParseSearch,
  defaultStringifySearch,
  type HistoryState,
  useNavigate,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { TimetableSearch } from "./timetableSearch";
import { matchesDesktop } from "./useIsDesktop";
import {
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

// Editor and view navigation lives in search params, so back walks through
// sheets and courses. Opening a sheet or another course pushes; everything
// else replaces. Pushes record their `sheetDepth`, so closing the sheet pops
// all of them in one go
export function useTimetableNav() {
  const search = useSearch({ strict: false }) as TimetableSearch;
  const navigate = useNavigate();
  const router = useRouter();

  // edit and view share this hook, so navigate relative to the current route
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
            }
          : { chronoNav: true };
      }
      await navigate({
        to: ".",
        search: (prev) => update(prev as TimetableSearch),
        resetScroll: false,
        state,
        // only history pops fall through to the router default, so a move a
        // caller already animates never starts a second transition
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
        // the pop is animated by the router's default transition
        router.history.back();
      } else {
        go(strip, { push: false, transition });
      }
    },
    [router, go],
  );

  return useMemo(() => {
    // phone: tabs and courses show inside the courses sheet, so moving to one
    // pushes the sheet unless it is already showing
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
        const { sheetDepth } = loc.state;
        // a desktop link skips normalizeDeepLinkedSheet, then the window shrinks
        if (!sheetDepth || !loc.search.sheet) {
          back(stripSheet);
          return;
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
        // a `type` deep-links a section type; without one the default type
        // shows, or the current one if this course is already open
        const update = (p: TimetableSearch): TimetableSearch => ({
          ...p,
          course: courseId,
          type: type ?? (p.course === courseId ? p.type : undefined),
          ...sheet,
        });
        // already showing this course: switch type in place, so back returns
        // to the previous course rather than the previous type
        if (router.latestLocation.search.course === courseId && !closed) {
          await go(update, { push: false, transition });
          return;
        }
        // a closed sheet pushes the list first, so back returns to it before
        // closing. Over warnings the course is pushed straight on top
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

// A deep-linked sheet has no entry of ours below it, so closing it would
// leave the page. Before the router reads history, put the page without the
// sheet below it and push the sheet the way opening it would have
export function normalizeDeepLinkedSheet(): void {
  const { pathname, search, hash } = window.location;
  const current = window.history.state as
    | (HistoryState & { __TSR_index?: number })
    | null;
  const s = defaultParseSearch(search) as TimetableSearch;
  if (!s.sheet || current?.chronoNav) return;

  let entries: [TimetableSearch, HistoryState][];
  if (s.sheet === "announcements") {
    const { sheet: _s, ...rest } = s;
    entries = [
      [rest, {}],
      [s, { chronoNav: true }],
    ];
  } else if (
    (s.sheet === "courses" || s.sheet === "warnings") &&
    /^\/(edit|view)\//.test(pathname) &&
    !matchesDesktop()
  ) {
    entries = [
      [stripSheet(s), {}],
      [stripCourse(s), { chronoNav: true, sheetDepth: 1 }],
    ];
    if (s.course) entries.push([s, { chronoNav: true, sheetDepth: 2 }]);
  } else {
    return;
  }

  const index = current?.__TSR_index ?? 0;
  entries.forEach(([entrySearch, state], i) => {
    // the same keys @tanstack/history gives every entry
    const key = (Math.random() + 1).toString(36).substring(7);
    const href = `${pathname}${defaultStringifySearch(entrySearch)}${hash}`;
    const next = { ...state, key, __TSR_key: key, __TSR_index: index + i };
    if (i === 0) window.history.replaceState(next, "", href);
    else window.history.pushState(next, "", href);
  });
}
