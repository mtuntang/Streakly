import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  fromKey,
  toKey,
} from "@streakly/shared";
import {
  createGoal,
  deleteGoal,
  goalExists,
  loadGoal,
  loadGoals,
  removeCheckIn,
  reorderGoals,
  toggleCheckIn,
  updateGoal,
} from "../lib/goals";

const jsonError = (c: Context, message: string, status: 400 | 404 | 500) =>
  c.json({ error: message }, status);

// Route table, grouped by resource:
//   collection routes (list / create / reorder) are declared first;
//   the per-goal group (/:id, /:id/checkins) is mounted after.
const goalsCollection = new Hono()
  /** List goals. */
  .get("/", async (c) => c.json(await loadGoals()))
  /** Create a goal. */
  .post("/", async (c) => {
    try {
      const json = await c.req.json().catch(() => null);
      if (!json) return jsonError(c, "Invalid JSON body", 400);
      const parsed = CreateGoalSchema.safeParse(json);
      if (!parsed.success) {
        return jsonError(c, parsed.error.issues[0]?.message ?? "Invalid request", 400);
      }
      return c.json(await createGoal(parsed.data), 201);
    } catch (error) {
      console.error("Failed to create goal:", error);
      return jsonError(c, "Failed to create goal. Please try again.", 500);
    }
  })
  /** Reorder goals: body { ids: string[] }, each id's order = its index. */
  .patch("/reorder", async (c) => {
    try {
      const json = await c.req.json().catch(() => null);
      if (!json) return jsonError(c, "Invalid JSON body", 400);
      const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(json);
      if (!parsed.success) {
        return jsonError(c, parsed.error.issues[0]?.message ?? "Invalid request", 400);
      }
      await reorderGoals(parsed.data.ids);
      return c.json(await loadGoals());
    } catch (error) {
      console.error("Failed to reorder goals:", error);
      return jsonError(c, "Failed to reorder goals.", 500);
    }
  });

/** Per-goal resource group: everything scoped to one goal id. */
const goalResource = new Hono()
  /** Get one goal. */
  .get("/:id", async (c) => {
    const goal = await loadGoal(c.req.param("id"));
    if (!goal) return jsonError(c, "Goal not found", 404);
    return c.json(goal);
  })
  /** Update a goal. */
  .patch("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const json = await c.req.json().catch(() => null);
      if (!json) return jsonError(c, "Invalid JSON body", 400);
      const parsed = UpdateGoalSchema.safeParse(json);
      if (!parsed.success) {
        return jsonError(c, parsed.error.issues[0]?.message ?? "Invalid request", 400);
      }
      if (!(await goalExists(id))) return jsonError(c, "Goal not found", 404);
      await updateGoal(id, parsed.data);
      return c.json(await loadGoal(id));
    } catch (error) {
      console.error("Failed to update goal:", error);
      return jsonError(c, "Failed to update goal.", 500);
    }
  })
  /** Delete a goal. */
  .delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      if (!(await goalExists(id))) return jsonError(c, "Goal not found", 404);
      await deleteGoal(id);
      return c.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete goal:", error);
      return jsonError(c, "Failed to delete goal.", 500);
    }
  })
  /**
   * Toggle a check-in for a date (defaults to today). Voluntary rest-day
   * check-ins are allowed (count toward total, not streaks); un-checking is
   * always allowed.
   */
  .post("/:id/checkins", async (c) => {
    try {
      const id = c.req.param("id");
      if (!(await goalExists(id))) return jsonError(c, "Goal not found", 404);

      const body = await c.req.json().catch(() => ({}));
      const parsed = z
        .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional() })
        .safeParse(body);
      if (!parsed.success) {
        return jsonError(c, parsed.error.issues[0]?.message ?? "Invalid request", 400);
      }

      const dateKey = parsed.data.date ?? toKey(new Date());
      try {
        fromKey(dateKey);
      } catch {
        return jsonError(c, "Invalid date", 400);
      }

      const checked = await toggleCheckIn(id, dateKey);
      return c.json({ checked, goal: await loadGoal(id) });
    } catch (error) {
      console.error("Failed to toggle check-in:", error);
      return jsonError(c, "Failed to update check-in. Please try again.", 500);
    }
  })
  /** Explicitly remove a check-in (?date=YYYY-MM-DD, defaults to today). */
  .delete("/:id/checkins", async (c) => {
    try {
      const id = c.req.param("id");
      if (!(await goalExists(id))) return jsonError(c, "Goal not found", 404);

      const date = c.req.query("date") ?? toKey(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonError(c, "Invalid date format. Use YYYY-MM-DD.", 400);
      }

      await removeCheckIn(id, date);
      return c.json({ checked: false, goal: await loadGoal(id) });
    } catch (error) {
      console.error("Failed to delete check-in:", error);
      return jsonError(c, "Failed to remove check-in.", 500);
    }
  });

// Mount the per-goal group onto the collection. Collection routes are
// already registered, so /reorder is guaranteed to match before /:id.
export default goalsCollection.route("/", goalResource);
