import {
  GRID_START_HOUR,
  parseRoomTime,
  timetableDayNames,
} from "@/utils/timetableGrid";

const clockFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const yearDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const headingFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const axisFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hour12: true,
});

export const formatClock = (d: Date): string => clockFormat.format(d);

export const formatRange = (start: Date, end: Date): string =>
  `${formatClock(start)} – ${formatClock(end)}`;

// grid hours are 0-based, so hour 0 is the grid's first hour
const gridTime = (hour: number, minute = 0) =>
  new Date(2000, 0, 1, GRID_START_HOUR + hour, minute);

export const formatAxisHour = (hour: number): string =>
  axisFormat.format(gridTime(hour));

export const formatSlotStart = (hour: number): string =>
  formatClock(gridTime(hour));

// a run of `span` slots from `hour` ends at (hour + span - 1):50
export const formatSlotEnd = (hour: number, span: number): string =>
  formatClock(gridTime(hour + span - 1, 50));

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function formatExam(start: string | null, end: string | null): string {
  if (!start || !end) return "N/A";
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "N/A";
  const endText = sameDay(s, e)
    ? formatClock(e)
    : `${dateFormat.format(e)}, ${formatClock(e)}`;
  return `${dateFormat.format(s)}, ${formatClock(s)} – ${endText}`;
}

const relativeFormat = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
  style: "narrow",
});
const absoluteFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** e.g. `Oct 31, 2026, 4:36 PM`. */
export const formatTimestamp = (d: Date): string => absoluteFormat.format(d);

export function formatRelative(d: Date, now: Date): string {
  const elapsed = now.getTime() - d.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR)
    return relativeFormat.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY)
    return relativeFormat.format(-Math.floor(elapsed / HOUR), "hour");
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      DAY,
  );
  if (days < 7) return relativeFormat.format(-days, "day");
  return d.getFullYear() === now.getFullYear()
    ? dateFormat.format(d)
    : yearDateFormat.format(d);
}

export const formatDayHeading = (d: Date): string => headingFormat.format(d);

// e.g. `Mon, Wed, Fri · 9:00 AM – 9:50 AM · F102`
export function summarizeRoomTimes(roomTime: string[]): string[] {
  const hoursByRoomDay = new Map<string, number[]>();
  for (const entry of roomTime) {
    const slot = parseRoomTime(entry);
    if (!slot) continue;
    const key = `${slot.room}\u0000${slot.day}`;
    const list = hoursByRoomDay.get(key) ?? [];
    if (!list.includes(slot.hour)) list.push(slot.hour);
    hoursByRoomDay.set(key, list);
  }

  const merged = new Map<
    string,
    { room: string; from: number; to: number; days: number[] }
  >();
  for (const [key, hours] of hoursByRoomDay) {
    const [room, dayText] = key.split("\u0000");
    const day = Number(dayText);
    hours.sort((a, b) => a - b);
    let from = hours[0];
    let prev = hours[0];
    const flush = () => {
      const mergeKey = `${room}\u0000${from}\u0000${prev}`;
      const item = merged.get(mergeKey) ?? { room, from, to: prev, days: [] };
      item.days.push(day);
      merged.set(mergeKey, item);
    };
    for (const hour of hours.slice(1)) {
      if (hour !== prev + 1) {
        flush();
        from = hour;
      }
      prev = hour;
    }
    flush();
  }

  return [...merged.values()]
    .map((item) => ({ ...item, days: item.days.sort((a, b) => a - b) }))
    .sort((a, b) => a.days[0] - b.days[0] || a.from - b.from)
    .map(
      (item) =>
        `${item.days.map((d) => timetableDayNames[d].slice(0, 3)).join(", ")} · ${formatSlotStart(item.from)} – ${formatSlotEnd(item.from, item.to - item.from + 1)} · ${item.room}`,
    );
}
