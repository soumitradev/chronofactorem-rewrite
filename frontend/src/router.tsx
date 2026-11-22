import { QueryClient } from "@tanstack/react-query";
import { Router } from "@tanstack/react-router";
import { AxiosError } from "axios";
import NotFound from "./components/NotFound";
import { trackSharedTimetable } from "./lib/sharedTransition";
import { normalizeDeepLinkedSheet } from "./lib/useTimetableNav";
import {
  releaseStillNavbar,
  routeTransitionTypes,
  supportsTransitionTypes,
} from "./lib/viewTransitions";
import { routeTree } from "./routes";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // since we use loaders
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (
          error instanceof AxiosError &&
          error.response &&
          error.response.status < 500
        )
          return false;
        return failureCount < 1;
      },
    },
  },
});

// the router reads history once it is built
normalizeDeepLinkedSheet();

export const router = new Router({
  routeTree,

  defaultPreload: "intent",
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  context: {
    queryClient,
  },
  defaultNotFoundComponent: NotFound,
  // Timetable pages key scroll by path, so search-param-only history moves
  // (sheet, course, day/week) keep the page where it is. Every other page keys
  // by history entry, so following a link still starts at the top
  scrollRestoration: true,
  getScrollRestorationKey: (location) =>
    /^\/(edit|view)\//.test(location.pathname)
      ? location.pathname
      : (location.state.__TSR_key ?? location.href),
  // without transition types TanStack would transition search-only moves too
  defaultViewTransition: supportsTransitionTypes()
    ? { types: routeTransitionTypes }
    : false,
});

router.subscribe("onBeforeNavigate", trackSharedTimetable);
// runs after the router's own scroll restoration, which subscribes when the
// router is constructed
router.subscribe("onRendered", releaseStillNavbar);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    // pushed by the app, so back can pop it instead of leaving the page
    chronoNav?: boolean;
    // how many entries deep into the open sheet this one is
    sheetDepth?: number;
  }
}
