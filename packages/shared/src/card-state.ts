import { addDays } from "date-fns";
import type { Schedule } from "./schedule";
import { isScheduledDay, weekdayShort } from "./schedule";
import { fromKey, toKey, type StreakStats } from "./streaks";

/** Urgency hints for the weekly quota card copy. */
export type CardUrgency = "normal" | "quota-at-risk";

/** One of the two card states: today is a check-in day, or a rest day. */
export type CardCheckinState =
  | {
      kind: "checkin";
      /** The streak is broken: scheduled today, unchecked, history exists. */
      brokenStreak: boolean;
      /** Weekly quota urgency hint; always "normal" for non-weekly. */
      urgency: CardUrgency;
    }
  | { kind: "rest"; nextDayShort: string };

/**
 * Derives the goal card's check-in state for `now` from the schedule and
 * stats. One shared source of truth so card and detail sheet agree.
 */
export function cardCheckinState(
  schedule: Schedule | null,
  stats: StreakStats,
  now: Date,
): CardCheckinState {
  if (schedule?.type === "weekly") {
    const week = stats.week ?? { quota: 0, done: 0, met: false };
    const quotaLeft = week.quota - week.done;
    // Days strictly after today through Saturday (week starts Sunday).
    const daysLeft = 6 - now.getDay();
    const urgency: CardUrgency =
      week.met || quotaLeft <= 0 ? "normal" : daysLeft === 0 || quotaLeft > daysLeft ? "quota-at-risk" : "normal";
    return { kind: "checkin", brokenStreak: false, urgency };
  }

  if (!isScheduledDay(schedule, now.getDay())) {
    // Next scheduled day strictly after today.
    let d = addDays(now, 1);
    for (let i = 0; i < 7; i++) {
      if (isScheduledDay(schedule, d.getDay())) {
        return { kind: "rest", nextDayShort: weekdayShort(d.getDay()) };
      }
      d = addDays(d, 1);
    }
    return { kind: "rest", nextDayShort: weekdayShort(now.getDay()) };
  }

  const broken = !stats.active && stats.total > 0;
  return { kind: "checkin", brokenStreak: broken, urgency: "normal" };
}

/** How the card's check-in button should render. */
export interface ToggleButtonStyle {
  /** shadcn Button variant: filled when checked, outlined otherwise. */
  variant: "default" | "outline";
  /** Dashed border only for the unchecked rest-day invitation. */
  dashed: boolean;
  /** Filled with the goal color (the checked state). */
  filled: boolean;
}

/**
 * Button render state for a goal card, derived from the check-in state.
 * Single source of truth so dark/light and cadence variants stay in sync —
 * the rest-day checked state MUST render filled (variant "default"),
 * same as the daily toggle (dark-mode bug fixed in PR #9).
 */
export function toggleButtonStyle(
  state: CardCheckinState,
  doneToday: boolean,
): ToggleButtonStyle {
  if (state.kind === "rest") {
    if (doneToday) return { variant: "default", dashed: false, filled: true };
    return { variant: "outline", dashed: true, filled: false };
  }
  if (doneToday) return { variant: "default", dashed: false, filled: true };
  return { variant: "outline", dashed: true, filled: false };
}

// Re-export for convenience so consumers import from one module.
export { toKey, fromKey };