import { describe, it, expect } from "bun:test";
import {
  isScheduledDay,
  nextScheduledDayKey,
  ScheduleSchema,
  normalizeSchedule,
  cadenceLabel,
} from "./schedule";

describe("schedule", () => {
  it("daily is scheduled every day", () => {
    for (let d = 0; d < 7; d++) {
      expect(isScheduledDay({ type: "daily" }, d)).toBe(true);
    }
  });
  it("weekdays [1,3,5] → Mon true, Tue false", () => {
    const s = { type: "weekdays" as const, days: [1, 3, 5] };
    expect(isScheduledDay(s, 1)).toBe(true);
    expect(isScheduledDay(s, 2)).toBe(false);
    expect(isScheduledDay(s, 5)).toBe(true);
  });
  it("weekly is scheduled every day (quota handled by streak logic)", () => {
    expect(isScheduledDay({ type: "weekly", timesPerWeek: 3 }, 4)).toBe(true);
  });
  it("null schedule === daily", () => {
    expect(isScheduledDay(null, 3)).toBe(true);
  });
  it("schema rejects empty days, 7, bad type, 0 timesPerWeek", () => {
    expect(ScheduleSchema.safeParse({ type: "weekdays", days: [] }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "weekdays", days: [7] }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "weekly", timesPerWeek: 0 }).success).toBe(false);
    expect(ScheduleSchema.safeParse({ type: "monthly" }).success).toBe(false);
  });
  it("normalizeSchedule falls back to null on garbage", () => {
    expect(normalizeSchedule("junk")).toBe(null);
    expect(normalizeSchedule(undefined)).toBe(null);
  });
  it("normalizeSchedule dedupes and sorts days", () => {
    expect(normalizeSchedule({ type: "weekdays", days: [3, 1, 3] })).toEqual({
      type: "weekdays",
      days: [1, 3],
    });
  });
  it("normalizeSchedule keeps valid weekly", () => {
    expect(normalizeSchedule({ type: "weekly", timesPerWeek: 4 })).toEqual({
      type: "weekly",
      timesPerWeek: 4,
    });
  });
  it("nextScheduledDayKey: Wed 2026-09-09 → Fri for [1,3,5] (Wed is scheduled)", () => {
    expect(nextScheduledDayKey({ type: "weekdays", days: [1, 3, 5] }, "2026-09-09")).toBe("2026-09-11");
  });
  it("nextScheduledDayKey: Thu 2026-09-10 → Fri for [1,3,5]", () => {
    expect(nextScheduledDayKey({ type: "weekdays", days: [1, 3, 5] }, "2026-09-10")).toBe("2026-09-11");
  });
  it("nextScheduledDayKey: Fri 2026-09-11 → Mon 2026-09-14 for [1,3,5]", () => {
    expect(nextScheduledDayKey({ type: "weekdays", days: [1, 3, 5] }, "2026-09-11")).toBe("2026-09-14");
  });
  it("nextScheduledDayKey: daily → same day", () => {
    expect(nextScheduledDayKey(null, "2026-09-09")).toBe("2026-09-09");
  });
  it("cadenceLabel", () => {
    expect(cadenceLabel(null)).toBe("Every day");
    expect(cadenceLabel({ type: "daily" })).toBe("Every day");
    expect(cadenceLabel({ type: "weekdays", days: [1, 3, 5] })).toBe("Mon Wed Fri");
    expect(cadenceLabel({ type: "weekly", timesPerWeek: 3 })).toBe("3× per week");
  });
});