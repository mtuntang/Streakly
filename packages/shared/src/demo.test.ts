import { describe, expect, test } from "bun:test";
import { DEMO_GOALS, demoCreatedAt, demoHistory } from "./demo";
import { computeStreaks, toKey } from "./streaks";
import { isScheduledDay } from "./schedule";

// A Wednesday, so every weekdays demo goal is scheduled today.
const TODAY = new Date(2026, 9, 21);

describe("demo goals", () => {
  test("history is the same on every call", () => {
    for (const goal of DEMO_GOALS) {
      expect(demoHistory(goal, TODAY)).toEqual(demoHistory(goal, TODAY));
    }
  });

  test("history stays between the goal's creation and today", () => {
    for (const goal of DEMO_GOALS) {
      const keys = demoHistory(goal, TODAY);
      const first = toKey(demoCreatedAt(goal, TODAY));
      for (const key of keys) {
        expect(key >= first).toBe(true);
        expect(key <= toKey(TODAY)).toBe(true);
      }
      expect(keys.includes(toKey(TODAY))).toBe(goal.today);
    }
  });

  test("daily and weekdays goals show exactly the designed streak", () => {
    for (const goal of DEMO_GOALS) {
      if (goal.schedule?.type === "weekly") continue;
      const stats = computeStreaks(demoHistory(goal, TODAY), TODAY, goal.schedule);
      const growsToday = goal.today && isScheduledDay(goal.schedule, TODAY.getDay());
      expect({ name: goal.name, current: stats.current }).toEqual({
        name: goal.name,
        current: goal.streak + (growsToday ? 1 : 0),
      });
    }
  });

  test("weekly goals stop short of this week's quota", () => {
    for (const goal of DEMO_GOALS) {
      if (goal.schedule?.type !== "weekly") continue;
      const stats = computeStreaks(demoHistory(goal, TODAY), TODAY, goal.schedule);
      expect(stats.week?.met).toBe(false);
    }
  });
});
