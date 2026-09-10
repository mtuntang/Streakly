import { describe, it, expect } from "bun:test";
import { computeStreaks } from "./streaks";

const NOW = new Date("2026-09-09T12:00:00"); // Wednesday

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