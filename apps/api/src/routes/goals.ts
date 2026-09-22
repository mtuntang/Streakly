import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  CheckInBodySchema,
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
import { badRequest, notFound, parseBody } from "../lib/http";

// ── Handlers ────────────────────────────────────────────────────────────
// Validation errors throw HttpError(400) via parseBody; missing goals throw
// HttpError(404) from the lib functions. app.onError (index.ts) turns those
// into JSON responses and logs unexpected errors as 500s.

/** GET /goals — list all goals with computed streak stats. */
async function listGoals(c: Context) {
  return c.json(await loadGoals());
}

/** POST /goals — create a goal. */
async function createGoalRoute(c: Context) {
  const input = await parseBody(c, CreateGoalSchema);
  return c.json(await createGoal(input), 201);
}

/** PATCH /goals/reorder — body { ids: string[] }; each id's order = its index. */
async function reorderGoalsRoute(c: Context) {
  const { ids } = await parseBody(
    c,
    z.object({ ids: z.array(z.string()).min(1) }),
  );
  await reorderGoals(ids);
  return c.json(await loadGoals());
}

/** GET /goals/:id — one goal. */
async function getGoalRoute(c: Context) {
  const goal = await loadGoal(c.req.param("id")!);
  if (!goal) throw notFound();
  return c.json(goal);
}

/** PATCH /goals/:id — update goal fields, returns the updated DTO. */
async function updateGoalRoute(c: Context) {
  const id = c.req.param("id")!;
  const input = await parseBody(c, UpdateGoalSchema);
  await updateGoal(id, input);
  return c.json(await loadGoal(id));
}

/** DELETE /goals/:id — permanently remove a goal and its check-ins. */
async function deleteGoalRoute(c: Context) {
  await deleteGoal(c.req.param("id")!);
  return c.json({ ok: true });
}

/** POST /goals/:id/checkins — toggle a check-in (defaults to today). */
async function toggleCheckInRoute(c: Context) {
  const id = c.req.param("id")!;
  if (!(await goalExists(id))) throw notFound();

  const { date } = await parseBody(c, CheckInBodySchema);
  const dateKey = date ?? toKey(new Date());
  try {
    fromKey(dateKey);
  } catch {
    throw badRequest("Invalid date");
  }

  const checked = await toggleCheckIn(id, dateKey);
  return c.json({ checked, goal: await loadGoal(id) });
}

/** DELETE /goals/:id/checkins — remove a check-in (?date=YYYY-MM-DD, defaults to today). */
async function removeCheckInRoute(c: Context) {
  const id = c.req.param("id")!;
  if (!(await goalExists(id))) throw notFound();

  const date = c.req.query("date") ?? toKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw badRequest("Invalid date format. Use YYYY-MM-DD.");
  }

  await removeCheckIn(id, date);
  return c.json({ checked: false, goal: await loadGoal(id) });
}

// ── Route table ─────────────────────────────────────────────────────────
// Grouped by resource:
//   goalsCollection — scoped to the whole set
//   goalResource    — scoped to one goal id (mounted under the collection,
//                     so /reorder is guaranteed to match before /:id)
const goalsCollection = new Hono()
  .get("/", listGoals)
  .post("/", createGoalRoute)
  .patch("/reorder", reorderGoalsRoute);

const goalResource = new Hono()
  .get("/:id", getGoalRoute)
  .patch("/:id", updateGoalRoute)
  .delete("/:id", deleteGoalRoute)
  .post("/:id/checkins", toggleCheckInRoute)
  .delete("/:id/checkins", removeCheckInRoute);

export default goalsCollection.route("/", goalResource);