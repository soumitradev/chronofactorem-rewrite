import { QueryClient } from "@tanstack/react-query";
import { Router } from "@tanstack/react-router";
import { AxiosError } from "axios";
import NotFound from "./components/NotFound";
import { trackSharedTimetable } from "./lib/sharedTransition";
import {
  releaseStillNavbar,
  routeTransitionTypes,
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

// Only opt in to view transitions where transition types are supported;
// otherwise TanStack would transition search-only navigations too.
const supportsTransitionTypes =
  typeof CSS !== "undefined" &&
  CSS.supports("selector(:active-view-transition-type(a))");

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
  // by history entry, so following a link still starts at the top.
  scrollRestoration: true,
  getScrollRestorationKey: (location) =>
    /^\/(edit|view)\//.test(location.pathname)
      ? location.pathname
      : (location.state.__TSR_key ?? location.href),
  defaultViewTransition: supportsTransitionTypes
    ? { types: routeTransitionTypes }
    : false,
});

router.subscribe("onBeforeNavigate", trackSharedTimetable);
// runs after the router's own scroll restoration, which subscribes when the
// router is constructed
router.subscribe("onRendered", releaseStillNavbar);

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
