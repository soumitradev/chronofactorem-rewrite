import { useSyncExternalStore } from "react";

const desktopQuery = "(min-width: 1024px)";

export const matchesDesktop = () => window.matchMedia(desktopQuery).matches;

export function useIsDesktop(): boolean {
  return useSyncExternalStore((notify) => {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, matchesDesktop);
}
