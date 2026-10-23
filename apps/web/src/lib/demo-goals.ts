import {
  CreateGoalSchema,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  DEMO_GOALS,
  computeStreaks,
  demoCreatedAt,
  demoHistory,
  type CreateGoalInput,
  type GoalDTO,
  type Schedule,
} from "@streakly/shared";
import type { GoalsClient } from "./goals-client";

/** A demo goal as the in-memory store keeps it. */
type DemoRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  schedule: Schedule | null;
  createdAt: string;
  updatedAt: string;
  checkIns: Set<string>;
};

/**
 * Builds the goal as the api would send it. The stats come from the same
 * shared computeStreaks the api runs, so the demo's numbers follow the
 * real rules.
 */
function toGoalDTO(row: DemoRow, now: () => Date): GoalDTO {
  const keys = [...row.checkIns].sort();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    schedule: row.schedule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    checkIns: keys.map((date) => ({ date })),
    stats: computeStreaks(keys, now(), row.schedule),
  };
}

/**
 * Returns a GoalsClient that keeps the demo account's goals in memory: the
 * same goals and history as the dev seed, dated relative to today. Changes
 * last until the page is left or reloaded; nothing reaches the api.
 * `now` is the clock, so tests can pin the day.
 */
export function createDemoGoalsClient(now: () => Date = () => new Date()): GoalsClient {
  const start = now();
  let nextId = 1;
  const newId = () => `demo-${nextId++}`;
  let rows: DemoRow[] = DEMO_GOALS.map((goal) => {
    const created = demoCreatedAt(goal, start).toISOString();
    return {
      id: newId(),
      name: goal.name,
      description: goal.description,
      color: goal.color,
      icon: goal.icon,
      schedule: goal.schedule,
      createdAt: created,
      updatedAt: created,
      checkIns: new Set(demoHistory(goal, start)),
    };
  });

  /** Returns goal `id`, or throws the api's not-found message. */
  function find(id: string): DemoRow {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error("Goal not found.");
    return row;
  }

  const list = () => rows.map((row) => toGoalDTO(row, now));

  return {
    list: async () => list(),
    toggle: async (id, date) => {
      const row = find(id);
      if (!row.checkIns.delete(date)) row.checkIns.add(date);
      return toGoalDTO(row, now);
    },
    reorder: async (ids) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      const moved = ids.flatMap((id) => byId.get(id) ?? []);
      rows = [...moved, ...rows.filter((r) => !ids.includes(r.id))];
      return list();
    },
    save: async (id, input: CreateGoalInput) => {
      // The same validation the api runs at its edge.
      const parsed = CreateGoalSchema.parse(input);
      const stamp = now().toISOString();
      if (id) {
        const row = find(id);
        row.name = parsed.name;
        if (parsed.description !== undefined) row.description = parsed.description;
        if (parsed.color !== undefined) row.color = parsed.color;
        if (parsed.icon !== undefined) row.icon = parsed.icon;
        if (parsed.schedule !== undefined) row.schedule = parsed.schedule;
        row.updatedAt = stamp;
        return toGoalDTO(row, now);
      }
      const row: DemoRow = {
        id: newId(),
        name: parsed.name,
        description: parsed.description ?? null,
        color: parsed.color ?? DEFAULT_COLOR,
        icon: parsed.icon ?? DEFAULT_ICON,
        schedule: parsed.schedule ?? null,
        createdAt: stamp,
        updatedAt: stamp,
        checkIns: new Set(),
      };
      rows = [...rows, row];
      return toGoalDTO(row, now);
    },
    remove: async (id) => {
      find(id);
      rows = rows.filter((r) => r.id !== id);
    },
  };
}
