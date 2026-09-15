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

describe("weekly stats extras", () => {
  it("exposes quota progress and unit 'week' for weekly cadence", () => {
    // Week of Sun 9-6; checked Mon(7), Tue(8) → done=2, quota 4, unmet, reachable
    const s = computeStreaks(
      ["2026-09-07", "2026-09-08"],
      NOW,
      { type: "weekly", timesPerWeek: 4 },
    );
    expect(s.unit).toBe("week");
    expect(s.week).toEqual({ quota: 4, done: 2, met: false });
  });
  it("marks met when quota reached in the current week", () => {
    const s = computeStreaks(
      ["2026-09-06", "2026-09-07", "2026-09-08"], // Sun, Mon, Tue — quota 3
      NOW,
      { type: "weekly", timesPerWeek: 3 },
    );
    expect(s.week).toEqual({ quota: 3, done: 3, met: true });
  });
  it("doneToday for weekly stays based on today's check-in", () => {
    const s = computeStreaks(["2026-09-09"], NOW, { type: "weekly", timesPerWeek: 2 });
    expect(s.doneToday).toBe(true);
  });
  it("weekly current counts consecutive weeks meeting quota (unit week)", () => {
    // Prior week (Sun 8-30..Sat 9-5): 3 checks → met; this week met too → current 2
    const s = computeStreaks(
      ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-07", "2026-09-08", "2026-09-09"],
      NOW,
      { type: "weekly", timesPerWeek: 3 },
    );
    expect(s.unit).toBe("week");
    expect(s.current).toBe(2);
  });
});

describe("rest-day check-ins (voluntary)", () => {
  it("doneToday is true when checked on an unscheduled day", () => {
    // Sat 9-12 is a rest day for Mon/Wed/Fri
    const s = computeStreaks(["2026-09-12"], new Date("2026-09-12T12:00:00"), WD);
    expect(s.doneToday).toBe(true);
  });
  it("a rest-day check-in does NOT grow the streak", () => {
    // Fri 9-11 checked (streak 1), voluntary Sat 9-12 check-in adds nothing
    const s = computeStreaks(
      ["2026-09-11", "2026-09-12"],
      new Date("2026-09-12T12:00:00"),
      WD,
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.total).toBe(2);
  });
  it("a rest-day check-in does not keep a dead chain alive", () => {
    // Last scheduled day Mon 9-7 checked, Sat 9-12 voluntary, today Sat →
    // Fri (scheduled) was missed, so the chain is dead regardless.
    const s = computeStreaks(
      ["2026-09-07", "2026-09-12"],
      new Date("2026-09-12T12:00:00"),
      WD,
    );
    expect(s.active).toBe(false);
    expect(s.current).toBe(0);
  });
  it("total counts voluntary check-ins", () => {
    const s = computeStreaks(
      ["2026-09-11", "2026-09-12"],
      new Date("2026-09-12T12:00:00"),
      WD,
    );
    expect(s.total).toBe(2);
  });
});

describe("stats shape lock (daily/weekdays)", () => {
  it("returns unit 'day' and no week field for daily and weekdays schedules", () => {
    const daily = computeStreaks(["2026-09-08"], NOW, null);
    const weekdays = computeStreaks(["2026-09-07"], NOW, WD);
    expect(daily.unit).toBe("day");
    expect(daily.week).toBeUndefined();
    expect(weekdays.unit).toBe("day");
    expect(weekdays.week).toBeUndefined();
  });
});