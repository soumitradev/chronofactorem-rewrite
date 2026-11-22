import { useEffect, useState } from "react";

// re-sync on visibilitychange to catch a laptop waking up or a date rollover while hidden
export function useNow(enabled: boolean): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      const d = new Date();
      setNow(d);
      timer = setTimeout(
        tick,
        60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20,
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return enabled ? now : null;
}
