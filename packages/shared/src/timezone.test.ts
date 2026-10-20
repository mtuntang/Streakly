import { describe, expect, it } from "bun:test";
import { computeStreaks, toKey } from "./streaks";
import { isValidTimeZone, TimeZoneSchema, todayKeyIn, zonedToday } from "./timezone";

// A server zone west of UTC that has DST: a result that only holds on a UTC
// server would fail here.
process.env.TZ = "America/Los_Angeles";

describe("harness", () => {
  it("runs under a non-UTC server zone", () => {
    expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(480);
  });
});

describe("isValidTimeZone / TimeZoneSchema", () => {
  it("accepts IANA zones", () => {
    for (const tz of ["America/Los_Angeles", "Asia/Kolkata", "Europe/London", "UTC"]) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  });

  it("rejects empty, unknown, and offset-only strings", () => {
    for (const tz of ["", "Mars/Olympus", "not a zone", "+05:00", "-08:00"]) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
  });

  it("schema rejects overlong input before touching Intl", () => {
    expect(TimeZoneSchema.safeParse("A".repeat(65)).success).toBe(false);
    expect(TimeZoneSchema.safeParse("Asia/Tokyo").success).toBe(true);
  });
});

describe("todayKeyIn", () => {
  const at = (iso: string) => new Date(iso);

  it("returns the civil day in the given zone, not the server's", () => {
    // 2026-10-16 23:30 UTC is already the 17th in Tokyo, still the 16th in LA.
    const instant = at("2026-10-16T23:30:00Z");
    expect(todayKeyIn("Asia/Tokyo", instant)).toBe("2026-10-17");
    expect(todayKeyIn("America/Los_Angeles", instant)).toBe("2026-10-16");
    expect(todayKeyIn("UTC", instant)).toBe("2026-10-16");
  });

  it("handles half-hour and +14 zones", () => {
    const instant = at("2026-10-16T18:29:00Z");
    expect(todayKeyIn("Asia/Kolkata", instant)).toBe("2026-10-16"); // 23:59 IST
    expect(todayKeyIn("Asia/Kolkata", at("2026-10-16T18:30:00Z"))).toBe("2026-10-17");
    expect(todayKeyIn("Pacific/Kiritimati", at("2026-10-16T10:00:00Z"))).toBe("2026-10-17");
    expect(todayKeyIn("Pacific/Pago_Pago", at("2026-10-16T10:00:00Z"))).toBe("2026-10-15");
  });

  it("falls back to the server's local day without a zone", () => {
    const instant = at("2026-10-17T03:00:00Z"); // 20:00 PDT on the 16th
    expect(todayKeyIn(null, instant)).toBe(toKey(instant));
    expect(todayKeyIn(undefined, instant)).toBe("2026-10-16");
  });

  it("falls back on an invalid stored zone instead of throwing", () => {
    expect(todayKeyIn("Mars/Olympus", at("2026-10-17T03:00:00Z"))).toBe("2026-10-16");
  });

  describe("spring forward (LA, 2026-03-08 02:00 → 03:00)", () => {
    it("the last minute before midnight is still the 7th", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-08T07:59:00Z"))).toBe("2026-03-07");
    });
    it("midnight PST starts the 8th", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-08T08:00:00Z"))).toBe("2026-03-08");
    });
    it("the minutes around the jump stay on the 8th", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-08T09:59:00Z"))).toBe("2026-03-08"); // 01:59 PST
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-08T10:00:00Z"))).toBe("2026-03-08"); // 03:00 PDT
    });
    it("the 8th ends at 23:59 PDT, an hour earlier in UTC", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-09T06:59:00Z"))).toBe("2026-03-08");
      expect(todayKeyIn("America/Los_Angeles", at("2026-03-09T07:00:00Z"))).toBe("2026-03-09");
    });
  });

  describe("fall back (LA, 2026-11-01 02:00 → 01:00)", () => {
    it("both 01:30s are the 1st", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-11-01T08:30:00Z"))).toBe("2026-11-01"); // 01:30 PDT
      expect(todayKeyIn("America/Los_Angeles", at("2026-11-01T09:30:00Z"))).toBe("2026-11-01"); // 01:30 PST
    });
    it("the 1st ends at 23:59 PST, an hour later in UTC", () => {
      expect(todayKeyIn("America/Los_Angeles", at("2026-11-02T07:59:00Z"))).toBe("2026-11-01");
      expect(todayKeyIn("America/Los_Angeles", at("2026-11-02T08:00:00Z"))).toBe("2026-11-02");
    });
  });

  it("follows the user's DST, not the server's (London, 2026-03-29)", () => {
    // London jumps 01:00 → 02:00 three weeks after LA does.
    expect(todayKeyIn("Europe/London", at("2026-03-28T23:59:00Z"))).toBe("2026-03-28");
    expect(todayKeyIn("Europe/London", at("2026-03-29T00:00:00Z"))).toBe("2026-03-29");
    expect(todayKeyIn("Europe/London", at("2026-10-24T22:59:00Z"))).toBe("2026-10-24"); // 23:59 BST
    expect(todayKeyIn("Europe/London", at("2026-10-24T23:00:00Z"))).toBe("2026-10-25");
  });
});

describe("zonedToday + computeStreaks", () => {
  it("is a Date whose local day is the user's civil day", () => {
    const today = zonedToday("Asia/Tokyo", new Date("2026-10-16T23:30:00Z"));
    expect(toKey(today)).toBe("2026-10-17");
  });

  it("a check-in on the user's today counts even when the server is a day behind", () => {
    const instant = new Date("2026-10-16T23:30:00Z"); // 16:30 on the 16th in LA
    const stats = computeStreaks(["2026-10-16", "2026-10-17"], zonedToday("Asia/Tokyo", instant));
    expect(stats.doneToday).toBe(true);
    expect(stats.current).toBe(2);
    // Without the zone, the server's day drops the 17th as a future check-in.
    expect(computeStreaks(["2026-10-16", "2026-10-17"], instant).current).toBe(1);
  });

  it("a daily run across spring forward is unbroken", () => {
    const keys = ["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"];
    const now = zonedToday("America/Los_Angeles", new Date("2026-03-09T18:00:00Z"));
    expect(computeStreaks(keys, now)).toMatchObject({ current: 4, longest: 4, doneToday: true });
  });

  it("a daily run across fall back is unbroken", () => {
    const keys = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
    const now = zonedToday("America/Los_Angeles", new Date("2026-11-02T20:00:00Z"));
    expect(computeStreaks(keys, now)).toMatchObject({ current: 4, longest: 4, doneToday: true });
  });

  it("grace through a DST night: yesterday checked keeps today's chain alive", () => {
    const now = zonedToday("America/Los_Angeles", new Date("2026-03-08T20:00:00Z"));
    expect(computeStreaks(["2026-03-06", "2026-03-07"], now)).toMatchObject({
      current: 2,
      active: true,
      doneToday: false,
    });
  });

  it("weekly quota counts the DST week as one week", () => {
    // Week of Sun 2026-03-08 (spring forward day) through Sat 03-14.
    const now = zonedToday("America/Los_Angeles", new Date("2026-03-14T20:00:00Z"));
    const stats = computeStreaks(["2026-03-08", "2026-03-11", "2026-03-14"], now, {
      type: "weekly",
      timesPerWeek: 3,
    });
    expect(stats.week).toEqual({ quota: 3, done: 3, met: true });
  });
});
