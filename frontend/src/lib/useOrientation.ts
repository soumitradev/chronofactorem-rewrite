import { useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import type { Orientation } from "@/components/timetable/TimetableSurface";
import { TimetableActionType, useTimetableState } from "@/context";
import { startSurfaceTransition } from "./viewTransitions";

export function useOrientation(): {
  orientation: Orientation;
  toggle(): void;
} {
  const {
    state: { isVertical },
    dispatch,
  } = useTimetableState();
  const toggle = useCallback(
    () =>
      startSurfaceTransition("orient", () =>
        flushSync(() => dispatch({ type: TimetableActionType.ToggleVertical })),
      ),
    [dispatch],
  );
  return useMemo(
    () => ({ orientation: isVertical ? "columns" : "rows", toggle }),
    [isVertical, toggle],
  );
}
