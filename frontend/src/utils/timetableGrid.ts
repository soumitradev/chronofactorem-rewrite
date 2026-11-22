import type { CSSProperties } from "react";
import { hueStyle } from "@/lib/courseHues";
import type { TimetableSectionType } from "./timetable";

export const GRID_START_HOUR = 8;
export const GRID_HOURS = 13;
export const MIN_DAYS = 5;
export const MIN_HOURS = 9;

export const timetableDays = ["M", "T", "W", "Th", "F", "S"];
export const timetableDayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type SurfaceMode = "edit" | "view" | "export";

export type TimetableCell = Omit<TimetableSectionType, "roomTime"> & {
  code: string;
  room: string;
  day: number;
  hour: number;
  span: number;
  hue?: number;
  /** Set by the surface while a section animates in or out. */
  presence?: "present" | "entering" | "leaving";
};

const parseSlot = (dayName: string, hourValue: string) => {
  const day = timetableDays.indexOf(dayName);
  const hour = Number(hourValue) - 1;
  if (day < 0 || !Number.isInteger(hour) || hour < 0 || hour >= GRID_HOURS)
    return null;
  return { day, hour };
};

// roomTime entries are CODE:ROOM:DAY:HOUR with a 1-based hour
export function parseRoomTime(entry: string) {
  const [code, room, dayName, hourValue] = entry.split(":");
  const slot = parseSlot(dayName, hourValue);
  return slot && { code, room, ...slot };
}

// timetable timings fuse the day and hour, as in CODE:Th3
function parseTiming(entry: string) {
  const match = /^(\D+)(\d+)$/.exec(entry.slice(entry.lastIndexOf(":") + 1));
  const slot = match && parseSlot(match[1], match[2]);
  return slot && { code: entry.split(":", 1)[0], ...slot };
}

export function buildTimetableGrid(sections: TimetableSectionType[]) {
  const slots = new Map<string, TimetableCell>();
  let dayCount = MIN_DAYS;
  let hourCount = MIN_HOURS;
  for (const section of sections) {
    for (const time of section.roomTime) {
      const slot = parseRoomTime(time);
      if (!slot) continue;
      slots.set(`${slot.day}:${slot.hour}`, { ...section, ...slot, span: 1 });
      dayCount = Math.max(dayCount, slot.day + 1);
      hourCount = Math.max(hourCount, slot.hour + 1);
    }
  }
  const cells: TimetableCell[] = [];
  for (let day = 0; day < dayCount; day++) {
    for (let hour = 0; hour < hourCount; hour++) {
      const cell = slots.get(`${day}:${hour}`);
      if (!cell) continue;
      while (hour + cell.span < hourCount) {
        const next = slots.get(`${day}:${hour + cell.span}`);
        if (!next || next.id !== cell.id || next.room !== cell.room) break;
        cell.span++;
      }
      cells.push(cell);
      hour += cell.span - 1;
    }
  }
  return { cells, dayCount, hourCount };
}

export type AgendaItem =
  | { kind: "class"; cell: TimetableCell }
  | { kind: "free"; from: number; to: number };

export function buildAgenda(cells: TimetableCell[], day: number): AgendaItem[] {
  const dayCells = cells
    .filter((cell) => cell.day === day)
    .sort((a, b) => a.hour - b.hour);
  const items: AgendaItem[] = [];
  let prevEnd: number | null = null;
  for (const cell of dayCells) {
    if (prevEnd !== null && cell.hour > prevEnd) {
      items.push({ kind: "free", from: prevEnd, to: cell.hour });
    }
    items.push({ kind: "class", cell });
    prevEnd = Math.max(prevEnd ?? 0, cell.hour + cell.span);
  }
  return items;
}

export function defaultDay(dayCount: number, now: Date): number {
  const dow = now.getDay();
  if (dow >= 1 && dow <= 5) return dow - 1;
  if (dow === 6 && dayCount === 6) return 5;
  return 0;
}

export function nowPosition(
  now: Date,
  dayCount: number,
  hourCount: number,
): { day: number; hour: number; fraction: number } | null {
  const dow = now.getDay();
  if (dow === 0) return null;
  const day = dow - 1;
  if (day >= dayCount) return null;
  const hour = now.getHours() - GRID_START_HOUR;
  if (hour < 0 || hour >= hourCount) return null;
  return { day, hour, fraction: now.getMinutes() / 60 };
}

export function splitCode(code: string): { dept: string; number: string } {
  const i = code.lastIndexOf(" ");
  if (i < 0) return { dept: "", number: code };
  return { dept: code.slice(0, i), number: code.slice(i + 1) };
}

const blockName = (cell: TimetableCell): string =>
  `tt-${cell.id}-${cell.day}-${cell.hour}`.replace(/[^a-zA-Z0-9_-]/g, "_");

// live blocks carry their morph name; export and leaving blocks don't
export function blockProps(cell: TimetableCell, mode: SurfaceMode) {
  const named = mode !== "export" && cell.presence !== "leaving";
  return {
    className: named ? "tt-block" : "",
    style: {
      ...hueStyle(cell.hue),
      ...(named ? { "--vt": blockName(cell) } : {}),
    } as CSSProperties,
  };
}

export function buildTimingsPreview(timings: readonly string[]) {
  // store the course code per slot so callers can tint each cell
  const filled = new Map<string, string>();
  let dayCount = MIN_DAYS;
  let hourCount = MIN_HOURS;
  for (const entry of timings) {
    const slot = parseTiming(entry);
    if (!slot) continue;
    filled.set(`${slot.day}:${slot.hour}`, slot.code);
    dayCount = Math.max(dayCount, slot.day + 1);
    hourCount = Math.max(hourCount, slot.hour + 1);
  }
  return { dayCount, hourCount, filled };
}
