import { hueStyle } from "@/lib/courseHues";
import {
  blockName,
  splitCode,
  type TimetableCell,
} from "@/utils/timetableGrid";
import { EmptyState, emptyTimetableHint } from "./EmptyState";
import { OpenButton } from "./OpenButton";
import { RemoveButton } from "./RemoveButton";
import { WeekGridFrame } from "./WeekGridFrame";

type WeekGridProps = {
  cells: TimetableCell[];
  dayCount: number;
  hourCount: number;
  mode: "edit" | "view" | "export";
  pending?: boolean;
  onOpen?: (
    cell: TimetableCell,
    event: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onRemove?: (cell: TimetableCell) => void;
  /** The now-line slot (C5). */
  now?: React.ReactNode;
};

// tiles are size containers: narrow ones (phone) stack dept / number so the
// number never truncates; from 88px wide (tablet) the code fits on one line
const tileClass =
  "course-tint relative z-1 min-w-0 overflow-hidden rounded-sm border border-line bg-ev";
const padClass =
  "flex size-full flex-col justify-between px-[6px] py-[4px] sm:pt-1.5 sm:pb-[5px] text-left leading-[1.12]";

/**
 * A grid tile's text. `spacer` floats a box of that size at the top right of
 * the first line so a word that would run under the editor's × wraps below it.
 * `reserve` instead pads the stacked layout's dept line clear of the × and
 * truncates it, so a narrow tile never grows a line.
 */
export function TileBody({
  cell,
  spacer,
  reserve,
}: {
  cell: TimetableCell;
  spacer?: string;
  reserve?: string;
}) {
  const { dept, number } = splitCode(cell.code);
  const float = spacer && (
    <span aria-hidden="true" className={`float-right ${spacer}`} />
  );
  const sec = `${cell.type}${cell.number}`;
  return (
    <>
      <span className="flex size-full flex-col justify-between @min-[88px]:hidden">
        <span>
          <span
            className={`block text-[9px] leading-none font-medium tracking-[0.02em] text-ink-muted ${
              reserve ? `truncate ${reserve}` : spacer ? "" : "truncate"
            }`}
          >
            {!reserve && float}
            {dept}
          </span>
          <span
            data-cell-title=""
            className="mt-[1px] block truncate text-[11.5px] leading-none font-semibold tracking-[0.01em] text-ink"
          >
            {number}
          </span>
        </span>
        <span className="block truncate font-mono text-[10px] leading-none font-normal text-ink/75">
          {cell.room}
        </span>
      </span>
      <span className="hidden size-full flex-col justify-between @min-[88px]:flex">
        <span>
          <span
            data-cell-title=""
            className={`block text-[12.5px] leading-tight font-semibold tracking-[0.01em] ${spacer ? "" : "truncate"}`}
          >
            {float}
            {cell.code}
          </span>
          <span className="mt-0.5 block font-mono text-[10.5px] font-medium text-ink-muted">
            {sec}
          </span>
        </span>
        <span className="block truncate font-mono text-[13px] leading-none font-medium tracking-[-0.03em] text-ink">
          {cell.room}
        </span>
      </span>
    </>
  );
}

export function WeekGrid({
  cells,
  dayCount,
  hourCount,
  mode,
  pending,
  onOpen,
  onRemove,
  now,
}: WeekGridProps) {
  return (
    <WeekGridFrame dayCount={dayCount} hourCount={hourCount}>
      {cells.length === 0 && (
        <EmptyState
          hint={emptyTimetableHint(mode)}
          className="z-1 self-center justify-self-center px-4"
          style={{ gridColumn: "2 / -1", gridRow: "2 / -1" }}
        />
      )}
      {cells.map((cell) => {
        const key = `${cell.id}-${cell.day}-${cell.hour}`;
        const leaving = cell.presence === "leaving";
        // live tiles carry their morph name (C7); export and leaving don't
        const named = mode !== "export" && !leaving;
        const placement = {
          gridColumn: cell.day + 2,
          gridRow: `${cell.hour + 2} / span ${cell.span}`,
          ...hueStyle(cell.hue),
          ...(named ? { "--vt": blockName(cell) } : {}),
        } as React.CSSProperties;
        const nameClass = named ? "tt-block" : "";
        return mode === "edit" ? (
          // the open button and the × are siblings, never nested
          <div
            key={key}
            style={placement}
            data-presence={cell.presence ?? "present"}
            inert={leaving}
            className={`@container ${tileClass} ${nameClass} hover:bg-ev-hover`}
          >
            <OpenButton
              cell={cell}
              disabled={pending || leaving}
              onOpen={onOpen}
              onRemove={onRemove}
              className={`${padClass} size-full rounded-sm @max-[87px]:px-1.5`}
            >
              <TileBody cell={cell} spacer="h-3 w-3" reserve="pr-2.5" />
            </OpenButton>
            {/* the tile is small, so the ×'s hit area stays at 28px rather
            than taking most of it */}
            <RemoveButton
              cell={cell}
              disabled={pending || leaving}
              onRemove={onRemove}
              iconSize={10}
              className="top-[3px] right-px size-3.5 after:size-7"
              hitClassName="size-7"
            />
          </div>
        ) : (
          <div
            key={key}
            style={placement}
            data-presence={cell.presence ?? "present"}
            inert={leaving}
            className={`@container ${tileClass} ${padClass} ${nameClass}`}
          >
            <TileBody cell={cell} />
          </div>
        );
      })}
      {now}
    </WeekGridFrame>
  );
}
