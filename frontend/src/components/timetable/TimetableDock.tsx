import { Columns3, Menu, Rows3 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useSurfaceNav } from "@/lib/useSurfaceNav";
import { useTimetableNav } from "@/lib/useTimetableNav";
import { timetableDayNames } from "@/utils/timetableGrid";

export function TimetableDock({
  dayCount,
  actions,
}: {
  dayCount: number;
  actions: ReactNode;
}) {
  const { view, day, setView, showDay } = useSurfaceNav(dayCount);
  const { openSheet } = useTimetableNav();
  const dockRef = useRef<HTMLDivElement>(null);

  // mid view transition Chrome hit-tests taps to <html>, so a quick second tap
  // on a pill is lost; hand it to the (fixed) dock button under the finger
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.target !== document.documentElement) return;
      // an open sheet's panel slides land here too; its aria-hidden dock must not react
      if (dockRef.current?.closest("[aria-hidden='true'],[inert]")) return;
      const hit = [...(dockRef.current?.querySelectorAll("button") ?? [])].find(
        (b) => {
          const r = b.getBoundingClientRect();
          return (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          );
        },
      );
      hit?.click();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div
      ref={dockRef}
      className="dock fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg px-3 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-2.5">
        <div data-shot="grid" className="flex items-center gap-1">
          <div className="relative flex flex-1 gap-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-brand"
              style={{
                width: `calc((100% - ${(dayCount - 1) * 4}px) / ${dayCount})`,
                transform: `translateX(calc(${day} * (100% + 4px)))`,
                transition:
                  "transform var(--d-3) var(--e-out), opacity var(--d-1)",
                opacity: view === "day" ? 1 : 0,
              }}
            />
            {timetableDayNames.slice(0, dayCount).map((name, i) => (
              <button
                key={name}
                type="button"
                aria-pressed={view === "day" && day === i}
                onClick={() => showDay(i)}
                // "Mon" for voice control, the full name for screen readers
                className="relative z-[1] min-h-11 min-w-0 flex-1 cursor-pointer rounded-md font-mono text-[13px] font-medium text-ink-muted transition-colors duration-(--d-2) aria-pressed:text-brand-ink focus-visible:outline-2 focus-visible:outline-ring"
              >
                {name.slice(0, 3)}
                <span className="sr-only">{name.slice(3)}</span>
              </button>
            ))}
          </div>
          <Segmented
            size="sm"
            className="ml-1.5 w-[84px] shrink-0"
            value={view}
            onValueChange={setView}
            aria-label="Choose a layout"
            options={[
              {
                value: "day",
                label: <Rows3 size={16} aria-hidden="true" />,
                "aria-label": "Day",
              },
              {
                value: "week",
                label: <Columns3 size={16} aria-hidden="true" />,
                "aria-label": "Week",
              },
            ]}
          />
        </div>
        <div data-shot="timetable-header" className="flex gap-2.5 px-1">
          <Button
            variant="secondary"
            className="min-w-0 flex-1"
            onClick={() => openSheet("courses")}
          >
            <Menu aria-hidden="true" />
            <span className="truncate">Courses and exams</span>
          </Button>
          {actions}
        </div>
      </div>
    </div>
  );
}
