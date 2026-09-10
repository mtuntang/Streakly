import { z } from "zod";
import { addDays } from "date-fns";
import { fromKey, toKey } from "./streaks";

export const ScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("weekdays"),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7),
  }),
  z.object({
    type: z.literal("weekly"),
    timesPerWeek: z.number().int().min(1).max(7),
  }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

/**
 * Is this ISO weekday (0=Sun..6=Sat) a scheduled day?
 * null schedule === daily, so everything is scheduled.
 * Weekly goals are "scheduled" every day — quota is handled by streak logic.
 */
export function isScheduledDay(
  schedule: Schedule | null,
  weekday: number,
): boolean {
  if (!schedule || schedule.type !== "weekdays") return true;
  return schedule.days.includes(weekday);
}

/**
 * Parse arbitrary stored JSON into a Schedule; anything invalid → null (daily).
 * Dedupes + sorts weekdays so stored garbage like [3,1,3] becomes [1,3].
 */
export function normalizeSchedule(raw: unknown): Schedule | null {
  if (raw && typeof raw === "object" && "type" in raw) {
    const obj = raw as { type: string; days?: unknown };
    if (obj.type === "weekdays" && Array.isArray(obj.days)) {
      obj.days = [...new Set(obj.days as number[])].sort((a, b) => a - b);
    }
  }
  const parsed = ScheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human-readable cadence: "Every day" / "Mon Wed Fri" / "3× per week". */
export function cadenceLabel(schedule: Schedule | null): string {
  if (!schedule || schedule.type === "daily") return "Every day";
  if (schedule.type === "weekly") return `${schedule.timesPerWeek}× per week`;
  return schedule.days.map((d) => WEEKDAY_LABELS[d]).join(" ");
}

/** Short weekday name for a schedule day, e.g. 1 → "Mon". */
export function weekdayShort(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

/**
 * Next scheduled date key strictly after `fromKeyStr`.
 * Daily/null/weekly → same day (every day is scheduled).
 */
export function nextScheduledDayKey(
  schedule: Schedule | null,
  fromKeyStr: string,
): string {
  if (!schedule || schedule.type !== "weekdays") return fromKeyStr;
  let d = addDays(fromKey(fromKeyStr), 1);
  for (let i = 0; i < 7; i++) {
    if (isScheduledDay(schedule, d.getDay())) return toKey(d);
    d = addDays(d, 1);
  }
  return fromKeyStr; // unreachable: a 7-day loop always hits one of 7 days
}