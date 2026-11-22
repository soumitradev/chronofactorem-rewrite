import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { RootSearch } from "./timetableSearch";

// The announcements sheet lives in a root-level `sheet=announcements` param, so
// it opens on any page and back closes it. Deep links get an entry below them
// (normalizeDeepLinkedSheet), so closing is always a pop
export function useAnnouncementsSheet() {
  const search = useSearch({ strict: false }) as RootSearch;
  const navigate = useNavigate();
  const router = useRouter();
  const open = search.sheet === "announcements";

  const show = useCallback(() => {
    if (router.latestLocation.search.sheet === "announcements") return;
    navigate({
      to: ".",
      search: (p: RootSearch) => ({ ...p, sheet: "announcements" }),
      state: { chronoNav: true },
      resetScroll: false,
    });
  }, [navigate, router]);

  const hide = useCallback(() => {
    if (router.state.location.search.sheet === "announcements")
      router.history.back();
  }, [router]);

  return useMemo(() => ({ open, show, hide }), [open, show, hide]);
}
