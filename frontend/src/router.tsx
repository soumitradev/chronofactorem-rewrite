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
  // React Query does the caching, so loaders run on every preload and visit
  defaultPreloadStaleTime: 0,
  context: {
    queryClient,
  },
  defaultNotFoundComponent: NotFound,
  // timetable pages key scroll by path, so search-only moves keep their place
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
// after the router's scroll restoration, which subscribes on construction
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
