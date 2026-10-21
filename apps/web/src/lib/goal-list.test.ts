import { describe, it, expect } from "bun:test";
import type { GoalDTO } from "@streakly/shared";
import {
  moveGoal,
  neighborId,
  removeGoal,
  replaceGoal,
  restoreOrder,
  setCheckedOn,
  upsertGoal,
} from "./goal-list";

function goal(id: string, overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    id,
    name: id,
    description: null,
    color: "emerald",
    icon: "Flame",
    schedule: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    checkIns: [],
    stats: {
      current: 0,
      longest: 0,
      total: 0,
      doneToday: false,
      active: false,
      unit: "day",
      rate30: 0,
    },
    ...overrides,
  };
}

const ids = (goals: GoalDTO[]) => goals.map((g) => g.id);

describe("upsertGoal", () => {
  it("replaces a goal that is already in the list, in place", () => {
    const list = [goal("a"), goal("b")];
    const renamed = goal("a", { name: "renamed" });
    const next = upsertGoal(list, renamed);
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next[0]).toBe(renamed);
  });
  it("appends a goal that is not in the list yet", () => {
    expect(ids(upsertGoal([goal("a")], goal("b")))).toEqual(["a", "b"]);
  });
});

describe("replaceGoal", () => {
  it("replaces a goal that is in the list", () => {
    const fresh = goal("a", { name: "fresh" });
    expect(replaceGoal([goal("a")], fresh)[0]).toBe(fresh);
  });
  it("does not bring back a goal that was removed meanwhile", () => {
    expect(replaceGoal([goal("b")], goal("a"))).toEqual([goal("b")]);
  });
});

describe("removeGoal", () => {
  it("drops the goal with that id", () => {
    expect(ids(removeGoal([goal("a"), goal("b")], "a"))).toEqual(["b"]);
  });
});

describe("setCheckedOn", () => {
  it("checking adds the date and marks the goal done today", () => {
    const [next] = setCheckedOn([goal("a")], "a", "2026-10-20", true);
    expect(next!.checkIns).toEqual([{ date: "2026-10-20" }]);
    expect(next!.stats.doneToday).toBe(true);
  });
  it("unchecking removes the date and marks the goal not done", () => {
    const checked = goal("a", {
      checkIns: [{ date: "2026-10-19" }, { date: "2026-10-20" }],
      stats: { ...goal("a").stats, doneToday: true },
    });
    const [next] = setCheckedOn([checked], "a", "2026-10-20", false);
    expect(next!.checkIns).toEqual([{ date: "2026-10-19" }]);
    expect(next!.stats.doneToday).toBe(false);
  });
  it("checking twice does not add the date twice", () => {
    const once = setCheckedOn([goal("a")], "a", "2026-10-20", true);
    const twice = setCheckedOn(once, "a", "2026-10-20", true);
    expect(twice[0]!.checkIns).toEqual([{ date: "2026-10-20" }]);
  });
  it("leaves other goals untouched", () => {
    const b = goal("b");
    expect(setCheckedOn([goal("a"), b], "a", "2026-10-20", true)[1]).toBe(b);
  });
});

describe("moveGoal", () => {
  const list = [goal("a"), goal("b"), goal("c")];
  it("moves a goal forward to the target's position", () => {
    expect(ids(moveGoal(list, "a", "c")!)).toEqual(["b", "c", "a"]);
  });
  it("moves a goal backward to the target's position", () => {
    expect(ids(moveGoal(list, "c", "a")!)).toEqual(["c", "a", "b"]);
  });
  it("returns null when nothing would move", () => {
    expect(moveGoal(list, "a", "a")).toBeNull();
    expect(moveGoal(list, "a", "zzz")).toBeNull();
  });
  it("does not modify the list it is given", () => {
    moveGoal(list, "a", "c");
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });
});

describe("neighborId", () => {
  const list = [goal("a"), goal("b"), goal("c")];
  it("returns the id one place earlier or later", () => {
    expect(neighborId(list, "b", -1)).toBe("a");
    expect(neighborId(list, "b", 1)).toBe("c");
  });
  it("returns null past either end or for an unknown id", () => {
    expect(neighborId(list, "a", -1)).toBeNull();
    expect(neighborId(list, "c", 1)).toBeNull();
    expect(neighborId(list, "zzz", 1)).toBeNull();
  });
});

describe("restoreOrder", () => {
  it("puts the goals back in the given id order, keeping their current data", () => {
    const fresh = goal("a", { name: "fresh" });
    const next = restoreOrder([goal("b"), fresh], ["a", "b"]);
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next[0]).toBe(fresh);
  });
  it("keeps goals created meanwhile, at the end", () => {
    expect(ids(restoreOrder([goal("c"), goal("b"), goal("a")], ["a", "b"]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("skips ids of goals deleted meanwhile", () => {
    expect(ids(restoreOrder([goal("b")], ["a", "b"]))).toEqual(["b"]);
  });
});
