import {
  format,
  parseISO,
  differenceInCalendarDays,
  subDays,
  startOfWeek,
  addDays,
} from "date-fns";
import { isScheduledDay, type Schedule } from "./schedule";

/** Returns YYYY-MM-DD for a date (local time). */
export function toKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parses a YYYY-MM-DD key into a local Date at midnight. */
export function fromKey(key: string): Date {
  return parseISO(key);
}

/** Today's date key in local time. */
export function todayKey(): string {
  return toKey(new Date());
}

export interface StreakStats {
  current: number;
  longest: number;
  total: number;
  /** Whether the goal is already completed today. */
  doneToday: boolean;
  /** The goal is still "alive" — the chain is not broken at its head. */
  active: boolean;
}

/**
 * Computes streak statistics from a set of check-in date keys.
 *
 * Schedule semantics (optional third param; null = daily, identical to the
 * historical behavior):
 *
 * - Daily / weekdays: only scheduled days participate. Unscheduled days
 *   neither count toward the streak nor break the chain. Grace: if today is
 *   scheduled but unchecked, the chain stays alive as long as the previous
 *   scheduled day was checked.
 * - Weekly (X per week): flexible. The unit is a week (Sunday start,
 *   matching buildHeatmap). current counts consecutive weeks whose quota was
 *   met, plus the in-progress week is "active" while the quota is still
 *   reachable (enough days remain in the week to hit the quota).
 */
export function computeStreaks(
  dateKeys: string[],
  now: Date = new Date(),
  schedule: Schedule | null = null,
): StreakStats {
  const set = new Set(dateKeys);
  const sorted = [...dateKeys].filter(Boolean).sort((a, b) => a.localeCompare(b));

  if (schedule?.type === "weekly") {
    return weeklyStats(set, sorted, now, schedule.timesPerWeek);
  }

  const scheduled = (d: Date) => isScheduledDay(schedule, d.getDay());
  const today = toKey(now);
  const doneToday = scheduled(now) && set.has(today);

  // --- current + active: walk backward over scheduled days from today. ---
  // head = the first scheduled day found. If it's checked, count the run of
  // consecutive checked scheduled days. If the head is today and unchecked,
  // grace applies: the previous scheduled day checked keeps the chain alive
  // (this reproduces the historical "yesterday" grace for daily goals).
  let current = 0;
  let active = false;
  {
    let cursor = new Date(now);
    let headSeen = false;
    for (let i = 0; i < 366; i++) {
      const key = toKey(cursor);
      if (scheduled(cursor)) {
        if (set.has(key)) {
          active = true;
          // Count the run ending at this checked scheduled day.
          let runCursor = new Date(cursor);
          while (set.has(toKey(runCursor)) && scheduled(runCursor)) {
            current += 1;
            runCursor = addDays(runCursor, -1);
            // Skip unscheduled days inside the run without breaking.
            while (!scheduled(runCursor)) runCursor = addDays(runCursor, -1);
          }
          break;
        }
        if (headSeen || i > 0) break; // any scheduled day other than today unchecked → dead
        headSeen = true; // head is today, unchecked — grace continues
      }
      cursor = addDays(cursor, -1);
    }
  }

  // --- longest: walk calendar days from first to last check-in. ---
  // Unscheduled days are transparent: a Mon→Fri weekdays run with Tue/Thu
  // skipped is ONE run of 3, not three runs of 1.
  let longest = 0;
  if (sorted.length > 0) {
    let run = 0;
    let cursor = fromKey(sorted[0]);
    const end = fromKey(sorted[sorted.length - 1]);
    while (cursor <= end) {
      if (scheduled(cursor)) {
        if (set.has(toKey(cursor))) {
          run += 1;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  return { current, longest, total: sorted.length, doneToday, active };
}

/** Weekly (X per week) stats: the unit is a calendar week (Sunday start). */
function weeklyStats(
  set: Set<string>,
  sorted: string[],
  now: Date,
  quota: number,
): StreakStats {
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const today = toKey(now);
  const doneToday = set.has(today);

  const countWeek = (start: Date, inclusiveEnd: Date): number => {
    let n = 0;
    let cursor = new Date(inclusiveEnd);
    for (let i = 0; i < 7 && cursor >= start; i++) {
      if (set.has(toKey(cursor))) n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  };

  const checksThisWeek = countWeek(weekStart, now);
  const daysRemaining = 6 - differenceInCalendarDays(now, weekStart); // after today, through Sat
  const metThisWeek = checksThisWeek >= quota;
  const reachable = metThisWeek || daysRemaining >= quota - checksThisWeek;

  // current = consecutive weeks meeting quota, ending with the previous
  // fully-countable week. The current week counts too once its quota is met.
  let current = 0;
  let weekEnd = metThisWeek ? new Date(now) : addDays(weekStart, -1);
  for (let i = 0; i < 260; i++) {
    const ws = startOfWeek(weekEnd, { weekStartsOn: 0 });
    const we = addDays(ws, 6);
    if (countWeek(ws, we) >= quota) {
      current += 1;
      weekEnd = addDays(ws, -1);
    } else {
      break;
    }
  }

  // longest = best run of consecutive weeks meeting quota across history.
  let longest = 0;
  let run = 0;
  let prevWeekStart: Date | null = null;
  for (const key of sorted) {
    const ws = startOfWeek(fromKey(key), { weekStartsOn: 0 });
    if (prevWeekStart && ws <= prevWeekStart) continue; // week already evaluated
    const we = addDays(ws, 6);
    if (countWeek(ws, we) >= quota) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    prevWeekStart = ws;
  }

  return { current, longest, total: sorted.length, doneToday, active: reachable };
}

/**
 * Builds a GitHub-style heatmap grid for the last `weeks` weeks ending today.
 * Returns rows = weeks (oldest -> newest), each row = 7 days Sun..Sat.
 */
export interface HeatmapCell {
  key: string;
  date: Date;
  count: number;
  inFuture: boolean;
}

export function buildHeatmap(
  dateKeys: string[],
  weeks = 18,
  now: Date = new Date(),
): HeatmapCell[][] {
  const set = new Map<string, number>();
  for (const k of dateKeys) set.set(k, (set.get(k) ?? 0) + 1);

  const today = toKey(now);
  // End the grid on the current week's Saturday so today is near the right edge.
  const end = addDays(startOfWeek(now, { weekStartsOn: 0 }), 6);
  const start = subDays(end, weeks * 7 - 1);

  const grid: HeatmapCell[][] = [];
  let cursor = start;
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = toKey(cursor);
      column.push({
        key,
        date: cursor,
        count: set.get(key) ?? 0,
        inFuture: key > today,
      });
      cursor = addDays(cursor, 1);
    }
    grid.push(column);
  }
  return grid;
}

/** Returns the last N days as date keys, oldest first. */
export function lastNDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(toKey(subDays(now, i)));
  return out;
}

/** Human friendly label for a date key, e.g. "Mon, Jun 3". */
export function prettyDate(key: string): string {
  return format(fromKey(key), "EEE, MMM d");
}