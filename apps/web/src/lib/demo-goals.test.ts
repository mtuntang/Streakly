import { describe, expect, test } from "bun:test";
import { DEMO_GOALS, toKey } from "@streakly/shared";
import { createDemoGoalsClient } from "./demo-goals";

const TODAY = new Date(2026, 9, 21, 9);
const today = toKey(TODAY);

describe("demo goals client", () => {
  test("starts with the seed's goals, in the seed's order", async () => {
    const goals = await createDemoGoalsClient(() => TODAY).list();
    expect(goals.map((g) => g.name)).toEqual(DEMO_GOALS.map((g) => g.name));
  });

  test("toggle checks in and undoes it, with fresh stats", async () => {
    const client = createDemoGoalsClient(() => TODAY);
    const [goal] = (await client.list()).filter((g) => !g.stats.doneToday);
    const checked = await client.toggle(goal.id, today);
    expect(checked.stats.doneToday).toBe(true);
    expect(checked.stats.total).toBe(goal.stats.total + 1);
    const undone = await client.toggle(goal.id, today);
    expect(undone.stats).toEqual(goal.stats);
  });

  test("reorder returns the list in the new order", async () => {
    const client = createDemoGoalsClient(() => TODAY);
    const ids = (await client.list()).map((g) => g.id);
    const reversed = [...ids].reverse();
    expect((await client.reorder(reversed)).map((g) => g.id)).toEqual(reversed);
  });

  test("save creates at the end with defaults, then updates", async () => {
    const client = createDemoGoalsClient(() => TODAY);
    const created = await client.save(null, { name: "  Floss  " });
    expect(created).toMatchObject({ name: "Floss", color: "emerald", icon: "Flame", schedule: null });
    expect((await client.list()).at(-1)?.id).toBe(created.id);
    const updated = await client.save(created.id, { name: "Floss nightly", color: "rose" });
    expect(updated).toMatchObject({ id: created.id, name: "Floss nightly", color: "rose" });
  });

  test("save rejects what the api would reject", async () => {
    const client = createDemoGoalsClient(() => TODAY);
    await expect(client.save(null, { name: "" })).rejects.toThrow();
  });

  test("remove deletes the goal; a missing goal throws", async () => {
    const client = createDemoGoalsClient(() => TODAY);
    const [goal] = await client.list();
    await client.remove(goal.id);
    expect((await client.list()).some((g) => g.id === goal.id)).toBe(false);
    await expect(client.remove(goal.id)).rejects.toThrow("Goal not found.");
  });

  test("two clients never share changes", async () => {
    const a = createDemoGoalsClient(() => TODAY);
    const b = createDemoGoalsClient(() => TODAY);
    const [goal] = await a.list();
    await a.remove(goal.id);
    expect((await b.list())[0].id).toBe(goal.id);
  });
});
