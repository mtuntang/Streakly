import { describe, it, expect } from "bun:test";
import type { z } from "zod";
import {
  CheckInResponseSchema,
  CreateGoalSchema,
  GoalDTOSchema,
  UpdateGoalSchema,
} from "./goal-schemas";
import type { GoalDTO } from "./goal-config";

describe("goal schemas", () => {
  it("a blank description is stored as null, not an empty string", () => {
    expect(CreateGoalSchema.parse({ name: "x", description: "   " }).description).toBeNull();
    expect(UpdateGoalSchema.parse({ description: "" }).description).toBeNull();
  });
  it("a real description is trimmed and kept", () => {
    expect(CreateGoalSchema.parse({ name: "x", description: "  run 5k " }).description).toBe("run 5k");
  });
  it("an omitted description stays omitted", () => {
    expect("description" in CreateGoalSchema.parse({ name: "x" })).toBe(false);
  });
});

// Compile-time check that the response schema and the GoalDTO type describe
// the same shape: if either one gains or loses a field, tsc fails here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const schemaMatchesType: Same<z.infer<typeof GoalDTOSchema>, GoalDTO> = true;

const weeklyGoal: GoalDTO = {
  id: "0b6f1c1e-3c39-4c4e-9a43-5d2f0c7a1b2c",
  name: "Run",
  description: null,
  color: "emerald",
  icon: "Flame",
  schedule: { type: "weekly", timesPerWeek: 3 },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  checkIns: [{ date: "2026-10-19" }],
  stats: {
    current: 1,
    longest: 2,
    total: 1,
    doneToday: false,
    active: true,
    unit: "week",
    week: { quota: 3, done: 1, met: false },
    rate30: 50,
  },
};

describe("GoalDTOSchema", () => {
  it("the schema and the GoalDTO type stay in step", () => {
    expect(schemaMatchesType).toBe(true);
  });
  it("accepts a goal as the api returns it", () => {
    expect(GoalDTOSchema.parse(weeklyGoal)).toEqual(weeklyGoal);
  });
  it("rejects a goal with missing stats", () => {
    const noStats: Partial<GoalDTO> = { ...weeklyGoal };
    delete noStats.stats;
    expect(GoalDTOSchema.safeParse(noStats).success).toBe(false);
  });
  it("rejects an error body in place of a goal", () => {
    expect(GoalDTOSchema.safeParse({ error: "Not found." }).success).toBe(false);
  });
});

describe("CheckInResponseSchema", () => {
  it("accepts the toggle response", () => {
    const body = { checked: true, goal: weeklyGoal };
    expect(CheckInResponseSchema.parse(body)).toEqual(body);
  });
  it("rejects a response without the goal", () => {
    expect(CheckInResponseSchema.safeParse({ checked: true }).success).toBe(false);
  });
});
