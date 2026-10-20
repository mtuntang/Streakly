import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  computeStreaks,
  normalizeSchedule,
  DEFAULT_COLOR,
  DEFAULT_ICON,
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
  if (isPrismaError(error, "P2025")) {
    // P2025: "An operation failed because it depends on one or more records that were required but was not found."
    throw notFound();
  }
  throw error;
}

/** Returns whether an error is a known Prisma error with the given code. */
function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Throws 404 unless the id is a well-formed uuid. Goal ids are uuids, so
 * anything else cannot exist. Checking here instead of letting Prisma throw
 * on malformed uuid input keeps unknown and malformed ids on the same 404
 * path, so a malformed id never becomes a 500.
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
async function loadGoalRow(userId: string, id: string): Promise<GoalRow | null> {
  return db.goal.findFirst({
    where: { id, userId },
    include: { checkIns: { select: { date: true } } },
  });
}

/**
 * Maps a Prisma goal row (with check-ins) to the wire contract. `today` is
 * the user's civil day (zonedToday), so the stats say what is due and done
 * for the user, not for the server's clock.
 */
export function toGoalDTO(goal: GoalRow, today: Date): GoalDTO {
  // The wire contract and streak math run on "YYYY-MM-DD" civil-day strings.
  const checkIns = goal.checkIns.map((c) => ({ date: fromDayDate(c.date) }));
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
    checkIns,
    stats: computeStreaks(checkIns.map((c) => c.date), today, schedule),
  };
}

/** Loads all of one user's goals with computed streak stats. */
export async function loadGoals(userId: string, today: Date): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { select: { date: true } } },
  });
  return goals.map((goal) => toGoalDTO(goal, today));
}

/**
 * Throws 404 when an updateMany or deleteMany matched no rows. Unlike
 * update and delete, those calls return a count instead of throwing. No
 * match means the goal is missing or owned by someone else, and both read
 * as a 404.
 */
function assertFound(count: number): void {
  if (count === 0) throw notFound();
}

/**
 * Loads one of the user's goals with computed streak stats.
 * Routes call this instead of loading every goal to validate one; a goal
 * owned by another user returns null, which the route maps to 404.
 */
export async function loadGoal(
  userId: string,
  id: string,
  today: Date,
): Promise<GoalDTO | null> {
  assertGoalId(id);
  const goal = await loadGoalRow(userId, id);
  return goal ? toGoalDTO(goal, today) : null;
}

/**
 * Creates a goal for the user, placed after their existing goals.
 * Color and icon fall back to the shared defaults when omitted.
 */
export async function createGoal(
  userId: string,
  input: CreateGoalInput,
  today: Date,
): Promise<GoalDTO> {
  const color = input.color ?? DEFAULT_COLOR;
  const icon = input.icon ?? DEFAULT_ICON;

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
    include: { checkIns: { select: { date: true } } },
  });
  return toGoalDTO(goal, today);
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
  if (input.icon !== undefined) update.icon = input.icon;
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

/**
 * Sets each goal's order to its index in `ids`, in one transaction.
 * Ids the user does not own match nothing and are skipped; a list where
 * none matched is a 404, like any other write to a missing goal.
 */
export async function reorderGoals(userId: string, ids: string[]): Promise<void> {
  ids.forEach(assertGoalId);
  const results = await db.$transaction(
    ids.map((id, index) =>
      db.goal.updateMany({
        where: { id, userId },
        data: { order: index },
      }),
    ),
  );
  assertFound(results.reduce((sum, { count }) => sum + count, 0));
}

/**
 * Throws 404 unless the user owns goal `id`.
 * Every check-in change passes through this check, which is why check-in
 * rows need no userId of their own: ownership flows goal → check-in. It
 * reads only the id: the caller loads the full goal for its response.
 */
async function requireOwnedGoal(userId: string, id: string): Promise<void> {
  assertGoalId(id);
  const goal = await db.goal.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!goal) throw notFound();
}

/**
 * Converts a "YYYY-MM-DD" civil-day key to a Date for Prisma @db.Date.
 * new Date("YYYY-MM-DD") is UTC midnight, which Prisma stores as that day.
 */
function toDayDate(dateKey: string): Date {
  return new Date(dateKey);
}

/**
 * Converts a Prisma @db.Date value back to its "YYYY-MM-DD" key. Postgres
 * returns the day as UTC midnight, so the key must be read in UTC: the
 * local-time toKey would turn 2026-10-14 into 2026-10-13 on any server west
 * of UTC.
 */
function fromDayDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
    await db.checkIn.create({ data: { goalId: id, date: toDayDate(dateKey) } });
    return true;
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      // Already checked in for that date → this toggle means "un-check".
      await db.checkIn.deleteMany({
        where: { goalId: id, date: toDayDate(dateKey) },
      });
      return false;
    }
    translatePrismaError(error);
  }
}

/** Removes the goal's check-in for one date; no check-in is not an error. */
export async function removeCheckIn(
  userId: string,
  id: string,
  dateKey: string,
): Promise<void> {
  await requireOwnedGoal(userId, id);
  await db.checkIn.deleteMany({
    where: { goalId: id, date: toDayDate(dateKey) },
  });
}
