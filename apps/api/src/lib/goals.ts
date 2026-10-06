import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  computeStreaks,
  normalizeSchedule,
  toKey,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  GOAL_ICONS,
  type GoalDTO,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@streakly/shared";
import { notFound } from "./http";

type GoalRow = Prisma.GoalGetPayload<{
  include: { checkIns: { select: { date: true } } };
}>;

/** Maps a Prisma error to an HttpError where the message is user-meaningful. */
function translatePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: "An operation failed because it depends on one or more records that were required but was not found."
    if (error.code === "P2025") throw notFound();
  }
  throw error;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Goal ids are uuids; anything else cannot exist. Checking here (instead of
 * letting Prisma throw on malformed uuid input) keeps unknown and malformed
 * ids on the same 404 path — a malformed id must not become a 500.
 */
function assertGoalId(id: string): void {
  if (!UUID_RE.test(id)) throw notFound();
}

/**
 * Fetches a goal only if the user owns it: ownership check and fetch are
 * the same query. Two consequences:
 * 1. findFirst, not findUnique — (id, userId) is not a unique pair.
 * 2. A foreign goal returns null, same as a missing goal — routes turn
 *    both into 404, so ids can't be probed for existence.
 */
async function loadGoalRow(
  userId: string,
  id: string,
  include: Prisma.GoalInclude = { checkIns: { select: { date: true } } },
): Promise<GoalRow | null> {
  return db.goal.findFirst({ where: { id, userId }, include });
}

/** Maps a Prisma goal row (with check-ins) to the wire contract. */
export function toGoalDTO(goal: GoalRow): GoalDTO {
  // Postgres date columns come back as JS Dates (UTC midnight); the wire
  // contract and streak math run on "YYYY-MM-DD" civil-day strings.
  const dates = goal.checkIns.map((c) => toKey(c.date));
  const schedule = normalizeSchedule(goal.schedule);
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    color: goal.color,
    icon: goal.icon,
    schedule,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    checkIns: goal.checkIns.map((c) => ({ date: toKey(c.date) })),
    stats: computeStreaks(dates, new Date(), schedule),
  };
}

/** Loads all of one user's goals with computed streak stats. */
export async function loadGoals(userId: string): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { select: { date: true } } },
  });
  return goals.map(toGoalDTO);
}

/**
 * Prisma's updateMany/deleteMany return a count instead of throwing when
 * nothing matched the where clause — no row means the goal is missing OR
 * owned by someone else, and both read as a 404.
 */
function assertFound(count: number): void {
  if (count === 0) throw notFound();
}

/**
 * Loads one of the user's goals with computed streak stats.
 * Routes call this instead of loading every goal to validate one; a goal
 * owned by another user returns null, which the route maps to 404.
 */
export async function loadGoal(userId: string, id: string): Promise<GoalDTO | null> {
  assertGoalId(id);
  const goal = await loadGoalRow(userId, id);
  return goal ? toGoalDTO(goal) : null;
}

export async function goalExists(userId: string, id: string): Promise<boolean> {
  const goal = await db.goal.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return goal !== null;
}

export async function createGoal(
  userId: string,
  input: CreateGoalInput,
): Promise<GoalDTO> {
  const color = input.color ?? DEFAULT_COLOR;
  const icon =
    input.icon && GOAL_ICONS.includes(input.icon) ? input.icon : DEFAULT_ICON;

  // Place new goals at the end of THIS user's current order.
  const maxOrder = await db.goal.aggregate({
    where: { userId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const goal = await db.goal.create({
    data: {
      userId,
      name: input.name,
      description: input.description ?? null,
      color,
      icon,
      order: nextOrder,
      schedule:
        input.schedule === null
          ? Prisma.JsonNull
          : (input.schedule ?? undefined),
    },
  });

  const created = await loadGoal(userId, goal.id);
  if (!created) throw new Error("Goal vanished after create");
  return created;
}

/**
 * Updates the provided fields, throwing 404 when nothing matched.
 * The userId in the where clause makes updateMany both the ownership check
 * and the write, in one statement.
 */
export async function updateGoal(
  userId: string,
  id: string,
  input: UpdateGoalInput,
): Promise<void> {
  assertGoalId(id);
  const update: Prisma.GoalUpdateInput = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.color !== undefined) update.color = input.color;
  if (input.icon !== undefined && GOAL_ICONS.includes(input.icon)) {
    update.icon = input.icon;
  }
  if (input.schedule !== undefined) {
    update.schedule =
      input.schedule === null ? Prisma.JsonNull : input.schedule;
  }
  const { count } = await db.goal.updateMany({
    where: { id, userId },
    data: update,
  });
  assertFound(count);
}

/**
 * Deletes a goal and its check-ins, throwing 404 when nothing matched.
 * deleteMany over { id, userId } gives the same ownership-in-where pattern
 * as updateGoal: a foreign goal is indistinguishable from a missing one.
 */
export async function deleteGoal(userId: string, id: string): Promise<void> {
  assertGoalId(id);
  const { count } = await db.goal.deleteMany({ where: { id, userId } });
  assertFound(count);
}

export async function reorderGoals(userId: string, ids: string[]): Promise<void> {
  ids.forEach(assertGoalId);
  // Scoped per-goal updateMany: an id owned by someone else leaves count 0.
  await db.$transaction(
    ids.map((id, index) =>
      db.goal.updateMany({
        where: { id, userId },
        data: { order: index },
      }),
    ),
  );
}

/**
 * Loads the user's goal or throws 404 — the gate every check-in mutation
 * passes through. Check-in rows need no userId of their own because
 * ownership always flows goal → check-in via this gate.
 */
async function requireOwnedGoal(userId: string, id: string): Promise<GoalRow> {
  assertGoalId(id);
  const goal = await loadGoalRow(userId, id);
  if (!goal) throw notFound();
  return goal;
}

/**
 * Toggles a check-in for one goal+date. Returns true when the check-in was
 * created, false when it was removed. Race-safe: two concurrent toggles on
 * a missing check-in resolve to one create (the loser hits the unique
 * constraint and removes instead of erroring).
 */
export async function toggleCheckIn(
  userId: string,
  id: string,
  dateKey: string,
): Promise<boolean> {
  await requireOwnedGoal(userId, id);
  try {
    // Prisma @db.Date wants a Date; new Date("YYYY-MM-DD") is UTC midnight,
    // so toKey(fromKey(key)) round-trips losslessly.
    await db.checkIn.create({ data: { goalId: id, date: new Date(dateKey) } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Already checked in for that date → this toggle means "un-check".
      await db.checkIn.deleteMany({
        where: { goalId: id, date: new Date(dateKey) },
      });
      return false;
    }
    translatePrismaError(error);
  }
}

export async function removeCheckIn(
  userId: string,
  id: string,
  dateKey: string,
): Promise<void> {
  await requireOwnedGoal(userId, id);
  await db.checkIn.deleteMany({
    where: { goalId: id, date: new Date(dateKey) },
  });
}
