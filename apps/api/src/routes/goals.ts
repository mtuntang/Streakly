import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  CheckInBodySchema,
  DateKeySchema,
  CreateGoalSchema,
  UpdateGoalSchema,
  toKey,
} from "@streakly/shared";
import {
  createGoal,
  deleteGoal,
  loadGoal,
  loadGoals,
  removeCheckIn,
  reorderGoals,
  toggleCheckIn,
  updateGoal,
} from "../lib/goals";
import { badRequest, notFound, parseBody } from "../lib/http";
import { authenticateSession, type AuthEnv } from "../lib/auth";

// ── Handlers ────────────────────────────────────────────────────────────
// authenticateSession (mounted on both routers below) resolves the session cookie
// and sets userId; an anonymous request is a 401 before any validation.
// Validation errors throw HttpError(400) via parseBody; missing or
// foreign goals throw HttpError(404) from the lib functions. app.onError
// (app.ts) turns those into JSON responses.

/**
 * Loads one of the user's goals, or throws 404 when it is missing or foreign.
 * Handlers use it for every response that returns a goal, including the
 * re-read after a write: if the goal was deleted in between, the client gets
 * a 404 instead of a 200 with a null body.
 */
async function loadGoalOrThrow(userId: string, id: string) {
  const goal = await loadGoal(userId, id);
  if (!goal) throw notFound();
  return goal;
}

/** GET /goals — list the signed-in user's goals with computed streak stats. */
async function listGoals(c: Context<AuthEnv>) {
  return c.json(await loadGoals(c.get("userId")));
}

/** POST /goals — create a goal owned by the signed-in user. */
async function createGoalRoute(c: Context<AuthEnv>) {
  const input = await parseBody(c, CreateGoalSchema);
  return c.json(await createGoal(c.get("userId"), input), 201);
}

/** Upper bound on one reorder request, so a single call can't open a huge transaction. */
const MAX_REORDER_IDS = 500;

/** PATCH /goals/reorder — body { ids: string[] }; each id's order = its index. */
async function reorderGoalsRoute(c: Context<AuthEnv>) {
  const { ids } = await parseBody(
    c,
    // guid() accepts any 8-4-4-4-12 hex id, the same shape assertGoalId checks.
    z.object({ ids: z.array(z.guid("ids must be goal ids")).min(1).max(MAX_REORDER_IDS) }),
  );
  await reorderGoals(c.get("userId"), ids);
  return c.json(await loadGoals(c.get("userId")));
}

/** GET /goals/:id — one goal. Another user's id reads as missing (404). */
async function getGoalRoute(c: Context<AuthEnv>) {
  return c.json(await loadGoalOrThrow(c.get("userId"), c.req.param("id")!));
}

/** PATCH /goals/:id — update goal fields, returns the updated DTO. */
async function updateGoalRoute(c: Context<AuthEnv>) {
  const userId = c.get("userId");
  const id = c.req.param("id")!;
  const input = await parseBody(c, UpdateGoalSchema);
  await updateGoal(userId, id, input);
  return c.json(await loadGoalOrThrow(userId, id));
}

/** DELETE /goals/:id — permanently remove a goal and its check-ins. */
async function deleteGoalRoute(c: Context<AuthEnv>) {
  await deleteGoal(c.get("userId"), c.req.param("id")!);
  return c.json({ ok: true });
}

/** POST /goals/:id/checkins — toggle a check-in (defaults to today). */
async function toggleCheckInRoute(c: Context<AuthEnv>) {
  const userId = c.get("userId");
  const id = c.req.param("id")!;
  await loadGoalOrThrow(userId, id);

  const { date } = await parseBody(c, CheckInBodySchema);
  const dateKey = date ?? toKey(new Date());

  const checked = await toggleCheckIn(userId, id, dateKey);
  return c.json({ checked, goal: await loadGoalOrThrow(userId, id) });
}

/** DELETE /goals/:id/checkins — remove a check-in (?date=YYYY-MM-DD, defaults to today). */
async function removeCheckInRoute(c: Context<AuthEnv>) {
  const userId = c.get("userId");
  const id = c.req.param("id")!;
  await loadGoalOrThrow(userId, id);

  const parsed = DateKeySchema.safeParse(c.req.query("date") ?? toKey(new Date()));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]!.message);
  const date = parsed.data;

  await removeCheckIn(userId, id, date);
  return c.json({ checked: false, goal: await loadGoalOrThrow(userId, id) });
}

// ── Route table ─────────────────────────────────────────────────────────
// Grouped by resource, both behind authenticateSession:
//   goalsCollection — scoped to the whole set
//   goalResource    — scoped to one goal id (mounted under the collection,
//                     so /reorder is guaranteed to match before /:id)
const goalsCollection = new Hono<AuthEnv>()
  .use("*", authenticateSession)
  .get("/", listGoals)
  .post("/", createGoalRoute)
  .patch("/reorder", reorderGoalsRoute);

const goalResource = new Hono<AuthEnv>()
  .use("*", authenticateSession)
  .get("/:id", getGoalRoute)
  .patch("/:id", updateGoalRoute)
  .delete("/:id", deleteGoalRoute)
  .post("/:id/checkins", toggleCheckInRoute)
  .delete("/:id/checkins", removeCheckInRoute);

export default goalsCollection.route("/", goalResource);
