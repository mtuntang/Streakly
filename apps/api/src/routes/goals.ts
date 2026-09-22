import { Hono } from "hono";
import { db } from "../db";
import {
  computeStreaks,
  normalizeSchedule,
  type GoalDTO,
} from "@streakly/shared";

/** Mirrors src/lib/goals-api.ts loadGoals() — deduplicated in PR 2. */
export async function loadGoals(): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { select: { date: true } } },
  });

  return goals.map((g) => {
    const dates = g.checkIns.map((c) => c.date);
    const schedule = normalizeSchedule(g.schedule);
    const stats = computeStreaks(dates, new Date(), schedule);
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      icon: g.icon,
      schedule,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      checkIns: g.checkIns,
      stats,
    };
  });
}

export const goalsRoute = new Hono().get("/", async (c) => {
  const goals = await loadGoals();
  return c.json(goals);
});
