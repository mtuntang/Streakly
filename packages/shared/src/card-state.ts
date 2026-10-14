import type { Schedule } from "./schedule";
import { isScheduledDay, nextScheduledDayKey, weekdayShort } from "./schedule";
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
    const next = fromKey(nextScheduledDayKey(schedule, toKey(now)));
    return { kind: "rest", nextDayShort: weekdayShort(next.getDay()) };
  }

  // "Broken" needs a streak that once existed. Check-ins on rest days alone
  // raise total but never build a streak, so they don't count here.
  const broken = !stats.active && stats.longest > 0;
  return { kind: "checkin", brokenStreak: broken, urgency: "normal" };
}

/** How the card's check-in button should render. */
export interface ToggleButtonStyle {
  /** shadcn Button variant: filled when checked, outlined otherwise. */
  variant: "default" | "outline";
  /** Dashed border while unchecked, on rest days and check-in days alike. */
  dashed: boolean;
  /** Filled with the goal color (the checked state). */
  filled: boolean;
}

/**
 * Returns how a goal card's check-in button renders. Rest days and check-in
 * days render the same way, which keeps light and dark mode in sync: a
 * checked rest-day button must be filled (variant "default") like the daily
 * toggle, because an outline variant fought the fill color and never looked
 * checked in dark mode. The state parameter stays so the card passes its
 * state and the rule can differ per state again without touching callers.
 */
export function toggleButtonStyle(
  _state: CardCheckinState,
  doneToday: boolean,
): ToggleButtonStyle {
  return doneToday
    ? { variant: "default", dashed: false, filled: true }
    : { variant: "outline", dashed: true, filled: false };
}

// Re-export for convenience so consumers import from one module.
export { toKey, fromKey };