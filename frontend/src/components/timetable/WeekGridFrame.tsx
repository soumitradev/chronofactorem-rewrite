import { formatAxisHour } from "@/lib/formatTime";
import { timetableDayNames } from "@/utils/timetableGrid";

// the loading skeleton draws this same frame so nothing moves when the page arrives
export function WeekGridFrame({
  dayCount,
  hourCount,
  children,
}: {
  dayCount: number;
  hourCount: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative grid gap-x-[3px] gap-y-[5px] sm:gap-y-1.5 px-2.5 py-1 [--tt-row:50px] sm:[--tt-row:64px]"
      style={{
        gridTemplateColumns: `40px repeat(${dayCount}, minmax(0, 1fr))`,
        gridTemplateRows: `22px repeat(${hourCount}, var(--tt-row))`,
      }}
    >
      {timetableDayNames.slice(0, dayCount).map((name, d) => (
        <div
          key={name}
          className="self-end pb-1 text-center font-mono text-[11px] font-medium text-ink-muted"
          style={{ gridColumn: d + 2, gridRow: 1 }}
        >
          {name.slice(0, 3)}
        </div>
      ))}
      {Array.from({ length: hourCount }, (_, h) => (
        <div key={`hour-${h}`} className="contents">
          <div
            aria-hidden="true"
            className="pointer-events-none -mx-px -translate-y-[3px] sm:-translate-y-[3.5px] self-start border-gridline border-t"
            style={{ gridColumn: "2 / -1", gridRow: h + 2 }}
          />
          <div
            className="pr-1 text-right font-mono text-[11px] whitespace-nowrap text-ink-faint"
            style={{
              gridColumn: 1,
              gridRow: h + 2,
              transform: "translateY(-9px)",
            }}
          >
            {formatAxisHour(h)}
          </div>
        </div>
      ))}
      {children}
    </div>
  );
}
