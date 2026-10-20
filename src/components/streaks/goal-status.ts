import type { CardCheckinState, GoalDTO } from "@streakly/shared";

/**
 * What a status line asks of the user, which decides its color: `done` in
 * the goal's color, `due` and `rest` quiet, `risk` in the warning color.
 */
export type StatusTone = "done" | "due" | "rest" | "risk";

export interface GoalStatus {
  text: string;
  tone: StatusTone;
}

/**
 * Returns the line under a goal's streak, in words that say what actually
 * happened for its cadence. The card and the detail sheet both render it,
 * so they never disagree about a goal's state.
 */
export function goalStatus(
  goal: GoalDTO,
  state: CardCheckinState,
  now: Date,
): GoalStatus {
  const { stats } = goal;

  if (goal.schedule?.type === "weekly") {
    const week = stats.week;
    if (week?.met) return { text: "Quota met this week", tone: "done" };
    const left = Math.max((week?.quota ?? 0) - (week?.done ?? 0), 0);
    if (state.kind === "checkin" && state.urgency === "quota-at-risk") {
      // Days left in the week counting today (the week ends Saturday).
      const daysLeft = 7 - now.getDay();
      return {
        text: `${left} to go · ${daysLeft === 1 ? "last day" : `${daysLeft} days left`}`,
        tone: "risk",
      };
    }
    return { text: `${left} to go this week`, tone: stats.doneToday ? "done" : "due" };
  }

  if (state.kind === "rest") {
    return { text: `Rest day — back ${state.nextDayShort}`, tone: "rest" };
  }
  if (stats.doneToday) {
    // A tie with the record is still the longest run so far.
    return stats.current >= 2 && stats.current >= stats.longest
      ? { text: "Done today · your longest streak yet", tone: "done" }
      : { text: "Completed today", tone: "done" };
  }
  if (stats.current > 0) {
    return {
      text: stats.active ? "Streak alive — check in today" : "Current streak",
      tone: "due",
    };
  }
  if (state.kind === "checkin" && state.brokenStreak) {
    return { text: "Streak broken — start again today", tone: "due" };
  }
  return { text: "No active streak yet", tone: "due" };
}
