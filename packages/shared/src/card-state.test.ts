import { describe, it, expect } from "bun:test";
import { cardCheckinState } from "./card-state";
import type { StreakStats } from "./streaks";

const stats = (over: Partial<StreakStats>): StreakStats => ({
  current: 0,
  longest: 0,
  total: 0,
  doneToday: false,
  active: true,
  unit: "day",
  ...over,
});

describe("cardCheckinState", () => {
  it("weekly: every day is a check-in day; urgency when quota at risk", () => {
    // Sat 9-12, quota 4, done 2 → 2 needed, 0 days after today → at risk
    const s = cardCheckinState(
      { type: "weekly", timesPerWeek: 4 },
      stats({ week: { quota: 4, done: 2, met: false } }),
      new Date("2026-09-12T10:00:00"), // Saturday
    );
    expect(s).toMatchObject({ kind: "checkin", brokenStreak: false, urgency: "quota-at-risk" });
  });

  it("weekly: quota met → no urgency", () => {
    const s = cardCheckinState(
      { type: "weekly", timesPerWeek: 3 },
      stats({ unit: "week", week: { quota: 3, done: 3, met: true } }),
      new Date("2026-09-09T10:00:00"),
    );
    expect(s.kind).toBe("checkin");
    if (s.kind === "checkin") expect(s.urgency).toBe("normal");
  });

  it("weekly: quota still comfortably reachable → normal urgency", () => {
    const s = cardCheckinState(
      { type: "weekly", timesPerWeek: 4 },
      stats({ unit: "week", week: { quota: 4, done: 1, met: false } }),
      new Date("2026-09-08T10:00:00"), // Tuesday, 4 days after today
    );
    expect(s.kind).toBe("checkin");
    if (s.kind === "checkin") expect(s.urgency).toBe("normal");
  });

  it("weekdays: scheduled day → checkin, no restDay", () => {
    // Sep 10 2026 is a Thursday; schedule Mon+Wed → Thu is NOT scheduled actually.
    // Use Mon 9-7 with days [1,3]: scheduled.
    const s = cardCheckinState(
      { type: "weekdays", days: [1, 3] },
      stats({}),
      new Date("2026-09-07T10:00:00"), // Monday
    );
    expect(s).toMatchObject({ kind: "checkin", brokenStreak: false, urgency: "normal" });
  });

  it("weekdays: rest day reports next scheduled day short name", () => {
    // Thu 9-10 not in [1,3] → rest; next scheduled is Mon 9-14 → "Mon"
    const s = cardCheckinState(
      { type: "weekdays", days: [1, 3] },
      stats({}),
      new Date("2026-09-10T10:00:00"),
    );
    expect(s.kind).toBe("rest");
    if (s.kind === "rest") expect(s.nextDayShort).toBe("Mon");
  });

  it("daily: broken streak when scheduled today, unchecked, history exists", () => {
    const s = cardCheckinState(
      null,
      stats({ current: 0, active: false, total: 5 }),
      new Date("2026-09-10T10:00:00"),
    );
    expect(s).toMatchObject({ kind: "checkin", brokenStreak: true, urgency: "normal" });
  });

  it("daily: not broken for a fresh goal (no history)", () => {
    const s = cardCheckinState(null, stats({ total: 0 }), new Date("2026-09-10T10:00:00"));
    expect(s).toMatchObject({ kind: "checkin", brokenStreak: false, urgency: "normal" });
  });
});