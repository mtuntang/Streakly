import type { GoalDTO } from "@streakly/shared";

// Pure updates to the in-memory goal list. useGoals applies them through
// setGoals(prev => ...), so each one works on the latest list rather than
// the copy a click handler saw when it was created.

/** Replaces the goal with the same id in place, or appends it when new. */
export function upsertGoal(goals: GoalDTO[], goal: GoalDTO): GoalDTO[] {
  return goals.some((g) => g.id === goal.id)
    ? goals.map((g) => (g.id === goal.id ? goal : g))
    : [...goals, goal];
}

/**
 * Replaces the goal with the same id, and does nothing when it is gone.
 * A response that arrives after the goal was deleted must not bring it back.
 */
export function replaceGoal(goals: GoalDTO[], goal: GoalDTO): GoalDTO[] {
  return goals.map((g) => (g.id === goal.id ? goal : g));
}

/** Drops the goal with this id. */
export function removeGoal(goals: GoalDTO[], id: string): GoalDTO[] {
  return goals.filter((g) => g.id !== id);
}

/**
 * Marks one goal checked or unchecked on `dateKey` before the server answers.
 * It also sets doneToday, because the card's button reads that flag; the
 * server's reply then brings the recomputed streaks.
 */
export function setCheckedOn(
  goals: GoalDTO[],
  id: string,
  dateKey: string,
  checked: boolean,
): GoalDTO[] {
  return goals.map((g) => {
    if (g.id !== id) return g;
    const others = g.checkIns.filter((c) => c.date !== dateKey);
    const checkIns = checked ? [...others, { date: dateKey }] : others;
    return { ...g, checkIns, stats: { ...g.stats, doneToday: checked } };
  });
}

/**
 * Returns the list with goal `activeId` moved to the position of `overId`,
 * or null when the move changes nothing (same goal, or an unknown id).
 */
export function moveGoal(
  goals: GoalDTO[],
  activeId: string,
  overId: string,
): GoalDTO[] | null {
  const from = goals.findIndex((g) => g.id === activeId);
  const to = goals.findIndex((g) => g.id === overId);
  if (from === -1 || to === -1 || from === to) return null;
  const next = [...goals];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Puts the goals back in an earlier id order, keeping each goal's current
 * data. Used to undo a failed reorder without also undoing check-ins or
 * edits that landed meanwhile; goals created since go at the end.
 */
export function restoreOrder(goals: GoalDTO[], ids: string[]): GoalDTO[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const restored = ids.flatMap((id) => byId.get(id) ?? []);
  const known = new Set(ids);
  return [...restored, ...goals.filter((g) => !known.has(g.id))];
}
