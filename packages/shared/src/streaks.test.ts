import { describe, it, expect } from "bun:test";
import { computeStreaks } from "./streaks";

const NOW = new Date("2026-09-09T12:00:00"); // Wednesday
const WD = { type: "weekdays" as const, days: [1, 3, 5] }; // Mon/Wed/Fri

describe("computeStreaks (daily regression)", () => {
  it("counts consecutive days ending today", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW)).toMatchObject({
      current: 3,
      doneToday: true,
      active: true,
    });
  });
  it("keeps streak alive when yesterday done, today not yet", () => {
    expect(computeStreaks(["2026-09-08"], NOW)).toMatchObject({
      current: 1,
      active: true,
      doneToday: false,
    });
  });
  it("breaks when yesterday and today unchecked", () => {
    expect(computeStreaks(["2026-09-05"], NOW)).toMatchObject({
      current: 0,
      active: false,
    });
  });
  it("longest survives a mid-history gap", () => {
    const keys = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ];
    expect(computeStreaks(keys, NOW)).toMatchObject({ longest: 4, current: 4 });
  });
});

describe("computeStreaks (scheduled)", () => {
  it("skips unscheduled Tue: Mon+Tue+Wed checked → current 2, active true", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW, WD)).toMatchObject({
      current: 2,
      active: true,
      doneToday: true,
    });
  });
  it("missed scheduled Wed (Tue checked) → streak alive, current 1", () => {
    expect(computeStreaks(["2026-09-07", "2026-09-08"], NOW, WD)).toMatchObject({
      current: 1,
      active: true,
      doneToday: false,
    });
  });
  it("grace holds while no scheduled day is missed (Thu-only, now Wed)", () => {
    const thurs = { type: "weekdays" as const, days: [4] }; // Thursdays only
    // most recent scheduled day Thu 9-3 was checked; next Thu is 9-10 (future)
    expect(computeStreaks(["2026-09-03"], NOW, thurs)).toMatchObject({
      active: true,
      current: 1,
    });
  });
  it("grace expires once a scheduled day passes unchecked", () => {
    const thurs = { type: "weekdays" as const, days: [4] };
    // Thu 9-10 was scheduled and missed; now Fri 9-11 → dead
    expect(computeStreaks(["2026-09-03"], new Date("2026-09-11T12:00:00"), thurs)).toMatchObject({
      active: false,
      current: 0,
    });
  });
  it("longest: Mon→Fri run with skipped days is ONE run of 3", () => {
    const keys = ["2026-09-07", "2026-09-09", "2026-09-11"]; // Mon, Wed, Fri
    expect(computeStreaks(keys, new Date("2026-09-14T12:00:00"), WD)).toMatchObject({
      longest: 3,
      current: 3,
      active: true,
      doneToday: false,
    });
  });
  it("weekly 3×: Mon+Tue+Wed checked → intact", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-09-07", "2026-09-08", "2026-09-09"], NOW, wk)).toMatchObject({
      active: true,
    });
  });
  it("weekly 3×: Mon only checked, now Thursday → quota still reachable, active", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-09-07"], new Date("2026-09-10T12:00:00"), wk)).toMatchObject({
      active: true,
    });
  });
  it("weekly 3×: Mon only checked, now Friday → quota unreachable, dead", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-09-07"], new Date("2026-09-11T12:00:00"), wk)).toMatchObject({
      active: false,
    });
  });
  it("weekly 3×: nothing checked by Saturday → dead", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-08-31"], new Date("2026-09-12T12:00:00"), wk)).toMatchObject({
      active: false,
    });
  });
  it("null schedule behaves exactly like daily", () => {
    const keys = ["2026-09-07", "2026-09-08", "2026-09-09"];
    expect(computeStreaks(keys, NOW, null)).toEqual(computeStreaks(keys, NOW));
  });
});