import {
  format,
  parseISO,
  differenceInCalendarDays,
  subDays,
  startOfWeek,
  addDays,
} from "date-fns";

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
  /** The goal is still "alive" — done today OR done yesterday. */
  active: boolean;
}

/**
 * Computes streak statistics from a set of check-in date keys.
 *
 * Streak rules:
 *  - If today is checked, the current streak counts today + consecutive prior days.
 *  - If today is not checked but yesterday is, the streak is still alive and equals
 *    the run ending yesterday (grace period for the current day).
 *  - Otherwise the current streak is 0.
 */
export function computeStreaks(
  dateKeys: string[],
  now: Date = new Date(),
): StreakStats {
  const set = new Set(dateKeys);
  const today = toKey(now);
  const yesterday = toKey(subDays(now, 1));

  const doneToday = set.has(today);
  const active = set.has(today) || set.has(yesterday);

  // Anchor for counting the current streak: today if done, else yesterday if done.
  const anchorKey = doneToday ? today : set.has(yesterday) ? yesterday : null;

  let current = 0;
  if (anchorKey) {
    let cursor = fromKey(anchorKey);
    while (set.has(toKey(cursor))) {
      current += 1;
      cursor = subDays(cursor, 1);
    }
  }

  // Longest streak across the full history (sorted ascending).
  const sorted = [...dateKeys]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const d = fromKey(key);
    if (prev && differenceInCalendarDays(d, prev) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return {
    current,
    longest,
    total: sorted.length,
    doneToday,
    active,
  };
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
