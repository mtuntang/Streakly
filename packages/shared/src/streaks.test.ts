import { describe, it, expect } from "bun:test";
import { computeStreaks, toKey } from "./streaks";

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
  it("weekly 3×: Mon only checked, now Friday → today and Saturday can still meet it, active", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-09-07"], new Date("2026-09-11T12:00:00"), wk)).toMatchObject({
      active: true,
    });
  });
  it("weekly 3×: Mon only checked, now Saturday → only today left, quota unreachable, dead", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-09-07"], new Date("2026-09-12T12:00:00"), wk)).toMatchObject({
      active: false,
    });
  });
  it("weekly 3×: two checked, now Saturday unchecked → one check-in today meets it, active", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    const s = computeStreaks(["2026-09-07", "2026-09-09"], new Date("2026-09-12T12:00:00"), wk);
    expect(s).toMatchObject({ active: true, doneToday: false, week: { done: 2, met: false } });
  });
  it("weekly 3×: nothing checked by Saturday → dead", () => {
    const wk = { type: "weekly" as const, timesPerWeek: 3 };
    expect(computeStreaks(["2026-08-31"], new Date("2026-09-12T12:00:00"), wk)).toMatchObject({
      active: false,
    });
  });
  it("future check-ins don't count toward longest or total", () => {
    const keys = ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]; // NOW is 09-09
    expect(computeStreaks(keys, NOW)).toMatchObject({ current: 1, longest: 1, total: 1 });
  });
  it("duplicate keys count once in total", () => {
    expect(computeStreaks(["2026-09-08", "2026-09-08", "2026-09-09"], NOW).total).toBe(2);
  });
  it("weekly: a future check-in this week doesn't meet today's quota", () => {
    const s = computeStreaks(["2026-09-07", "2026-09-11"], NOW, { type: "weekly", timesPerWeek: 2 });
    expect(s).toMatchObject({ total: 1, week: { done: 1, met: false } });
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
  it("weekly longest resets on a week with no check-ins at all", () => {
    // Three single weeks with empty weeks between them: the best run is 1.
    const s = computeStreaks(
      ["2026-01-04", "2026-02-01", "2026-03-01"],
      new Date("2026-03-02T12:00:00"),
      { type: "weekly", timesPerWeek: 1 },
    );
    expect(s.longest).toBe(1);
  });
  it("weekly longest still counts back-to-back weeks as one run", () => {
    const s = computeStreaks(
      ["2026-02-15", "2026-02-22", "2026-03-01"],
      new Date("2026-03-02T12:00:00"),
      { type: "weekly", timesPerWeek: 1 },
    );
    expect(s.longest).toBe(3);
  });
  it("weekly current drops to 0 once this week's quota can no longer be met", () => {
    // 7×/week: three full weeks, then Sunday 10-11 missed. It is Monday, so
    // this week can't reach 7 any more: the streak is lost, like a daily goal's.
    const keys: string[] = [];
    for (let d = new Date("2026-09-20T12:00:00"); d <= new Date("2026-10-10T12:00:00"); d.setDate(d.getDate() + 1)) {
      keys.push(d.toISOString().slice(0, 10));
    }
    const s = computeStreaks(keys, new Date("2026-10-12T12:00:00"), { type: "weekly", timesPerWeek: 7 });
    expect(s).toMatchObject({ active: false, current: 0, longest: 3 });
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
/** Keys for every day in the 30 days ending NOW whose weekday is in `days`. */
function last30Keys(days: number[], skipToday = false): string[] {
  const keys: string[] = [];
  for (let i = skipToday ? 1 : 0; i < 30; i++) {
    const d = new Date(NOW);
    d.setDate(d.getDate() - i);
    if (days.includes(d.getDay())) keys.push(toKey(d));
  }
  return keys;
}

describe("30-day completion rate", () => {
  it("weekdays: every scheduled day checked → 100%, not 13/30", () => {
    expect(computeStreaks(last30Keys([1, 3, 5]), NOW, WD).rate30).toBe(100);
  });
  it("daily: today not checked yet doesn't count against the rate", () => {
    expect(computeStreaks(last30Keys([0, 1, 2, 3, 4, 5, 6], true), NOW).rate30).toBe(100);
  });
  it("weekdays: check-ins only on rest days don't raise it", () => {
    expect(computeStreaks(last30Keys([6]), NOW, WD).rate30).toBe(0);
  });
  it("weekly: share of the last 4 full weeks that met the quota", () => {
    // 2×/week. Weeks starting Aug 16, 23, 30 met; Aug 9 week only once.
    const keys = ["2026-08-10", "2026-08-17", "2026-08-18", "2026-08-24", "2026-08-25", "2026-08-31", "2026-09-01"];
    expect(computeStreaks(keys, NOW, { type: "weekly", timesPerWeek: 2 }).rate30).toBe(75);
  });
  it("no check-ins → 0%", () => {
    expect(computeStreaks([], NOW).rate30).toBe(0);
  });
});
