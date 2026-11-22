import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { formatSlotEnd, formatSlotStart } from "@/lib/formatTime";
import { titleCase } from "@/lib/titleCase";
import {
  blockProps,
  buildAgenda,
  type SurfaceMode,
  type TimetableCell,
  timetableDayNames,
} from "@/utils/timetableGrid";
import { EmptyState, emptyTimetableHint } from "./EmptyState";
import { NowLine } from "./NowLine";
import { OpenButton } from "./OpenButton";
import { RemoveButton } from "./RemoveButton";

type AgendaProps = {
  cells: TimetableCell[];
  day: number;
  mode: SurfaceMode;
  pending?: boolean;
  /** Today's grid hour and the formatted time; set only when it is on this day. */
  now?: { hour: number; fraction: number; label: string } | null;
  onOpen?: (
    cell: TimetableCell,
    event: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onRemove?: (cell: TimetableCell) => void;
};

const blockClass = "course-tint rounded-md border border-line bg-ev";
const bodyClass =
  "flex w-full items-center justify-between gap-3 rounded-md px-3.5 py-2.5 text-left";

function BlockBody({
  cell,
  remove = false,
}: {
  cell: TimetableCell;
  remove?: boolean;
}) {
  const roomPad = remove ? "pr-5" : ""; // clear the editor's × button
  return (
    <>
      <span className="min-w-0">
        <span className="block text-[15px] leading-snug font-medium tracking-[-0.01em]">
          {titleCase(cell.name)}
        </span>
        <span className="mt-0.5 block font-mono text-xs font-medium text-ink-muted">
          {cell.type}
          {cell.number}
        </span>
      </span>
      <span
        className={`shrink-0 text-right font-mono text-[15px] leading-none font-medium tracking-[-0.02em] text-ink ${roomPad}`}
      >
        {cell.room}
      </span>
    </>
  );
}

function AgendaBlock({
  cell,
  mode,
  pending,
  onOpen,
  onRemove,
}: Pick<AgendaProps, "mode" | "pending" | "onOpen" | "onRemove"> & {
  cell: TimetableCell;
}) {
  const leaving = cell.presence === "leaving";
  const block = blockProps(cell, mode);
  const shared = {
    "data-presence": cell.presence ?? "present",
    inert: leaving,
    style: block.style,
  };
  return mode === "edit" ? (
    // the open button and the × are siblings, never nested
    <div
      {...shared}
      className={`${blockClass} ${block.className} relative hover:bg-ev-hover`}
    >
      <OpenButton
        cell={cell}
        disabled={pending || leaving}
        onOpen={onOpen}
        onRemove={onRemove}
        className={bodyClass}
      >
        <BlockBody cell={cell} remove />
      </OpenButton>
      <RemoveButton
        cell={cell}
        disabled={pending || leaving}
        onRemove={onRemove}
        iconSize={14}
        className="top-1.5 right-1.5 size-5 after:size-11"
        hitClassName="size-11"
      />
    </div>
  ) : (
    <div
      {...shared}
      className={`${blockClass} ${bodyClass} ${block.className}`}
    >
      <BlockBody cell={cell} />
    </div>
  );
}

export function Agenda({
  cells,
  day,
  mode,
  pending,
  now,
  onOpen,
  onRemove,
}: AgendaProps) {
  const items = useMemo(() => buildAgenda(cells, day), [cells, day]);
  // free rows that appear later (a removal opens a gap) grow in like blocks
  const seen = useRef<{ day: number; keys: Set<string> } | null>(null);
  const freeKeys = new Set(
    items.flatMap((i) => (i.kind === "free" ? [`free-${i.from}`] : [])),
  );
  const prior = seen.current?.day === day ? seen.current.keys : null;
  useEffect(() => {
    seen.current = { day, keys: freeKeys };
  });
  // a new day starts at the top, set before the swipe's new snapshot
  const shownDay = useRef(day);
  useLayoutEffect(() => {
    if (shownDay.current === day) return;
    shownDay.current = day;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [day]);
  // the item the now-line follows: the free gap or the class holding this
  // hour. before the first class or after the last, there is none.
  const nowIndex = now
    ? items.findIndex((item) =>
        item.kind === "free"
          ? item.from <= now.hour && now.hour < item.to
          : item.cell.hour <= now.hour &&
            now.hour < item.cell.hour + item.cell.span,
      )
    : -1;

  if (items.length === 0) {
    return (
      <div className="tt-agenda flex justify-center px-4 py-12">
        <EmptyState
          hint={
            cells.length === 0
              ? emptyTimetableHint(mode)
              : `No classes on ${timetableDayNames[day]}.`
          }
        />
      </div>
    );
  }

  // the 10 minutes after a class are its break, not part of it. during the
  // class the now-line runs through its block at the share gone by (0–1)
  const elapsed = (cell: TimetableCell) =>
    now ? (now.hour + now.fraction - cell.hour) / (cell.span - 1 / 6) : -1;
  const isDuring = (cell: TimetableCell) => {
    const at = elapsed(cell);
    return at >= 0 && at < 1;
  };
  return (
    <div className="tt-agenda px-4 pt-3">
      {items.map((item, i) => (
        <Fragment
          key={
            item.kind === "free"
              ? `free-${item.from}`
              : `${item.cell.id}-${item.cell.hour}`
          }
        >
          {item.kind === "free" ? (
            <div
              className="tt-row"
              data-row-presence={
                prior && !prior.has(`free-${item.from}`)
                  ? "entering"
                  : undefined
              }
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mb-1.5 grid grid-cols-[64px_1fr] gap-3">
                  <div className="col-start-2 pt-1 pb-2.5 pl-0.5 font-mono text-xs text-ink-faint">
                    {`Free · ${formatSlotStart(item.from)} – ${formatSlotStart(item.to)}`}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="tt-row" data-row-presence={item.cell.presence}>
              <div className="min-h-0 overflow-hidden">
                <div className="relative mb-1.5 grid grid-cols-[64px_1fr] gap-3">
                  <div className="pt-2.5 text-right font-mono">
                    <div className="whitespace-nowrap text-xs font-medium">
                      {formatSlotStart(item.cell.hour)}
                    </div>
                    <div className="whitespace-nowrap text-xs text-ink-faint">
                      {formatSlotEnd(item.cell.hour, item.cell.span)}
                    </div>
                  </div>
                  <AgendaBlock
                    cell={item.cell}
                    mode={mode}
                    pending={pending}
                    onOpen={onOpen}
                    onRemove={onRemove}
                  />
                  {now && isDuring(item.cell) && (
                    <NowLine.Through
                      label={now.label}
                      at={elapsed(item.cell)}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          {now &&
            i === nowIndex &&
            !(item.kind === "class" && isDuring(item.cell)) && (
              <NowLine.Agenda label={now.label} />
            )}
        </Fragment>
      ))}
    </div>
  );
}
