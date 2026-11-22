import type { NavigateOptions } from "@tanstack/react-router";
import { router } from "../router";

export const preloadOnIntent = (to: NavigateOptions) => {
  const preload = () => {
    router.preloadRoute(to);
  };
  return { onPointerEnter: preload, onFocus: preload };
};

export const preloadEditorOnIntent = () => {
  const preload = () => {
    router.loadRouteChunk(router.routesByPath["/edit/$timetableId"]);
  };
  return { onPointerEnter: preload, onFocus: preload };
};
