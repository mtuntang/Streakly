import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  computeStreaks,
  normalizeSchedule,
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

/** Maps a Prisma goal row (with check-ins) to the wire contract. */
export function toGoalDTO(goal: GoalRow): GoalDTO {
  const dates = goal.checkIns.map((c) => c.date);
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
    checkIns: goal.checkIns,
    stats: computeStreaks(dates, new Date(), schedule),
  };
}

/** Loads all goals with computed streak stats. */
export async function loadGoals(): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { select: { date: true } } },
  });
  return goals.map(toGoalDTO);
}

/** Loads ONE goal with computed streak stats — routes must not load every goal to validate one. */
export async function loadGoal(id: string): Promise<GoalDTO | null> {
  const goal = await db.goal.findUnique({
    where: { id },
    include: { checkIns: { select: { date: true } } },
  });
  return goal ? toGoalDTO(goal) : null;
}

export async function goalExists(id: string): Promise<boolean> {
  const goal = await db.goal.findUnique({ where: { id }, select: { id: true } });
  return goal !== null;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalDTO> {
  const color = input.color ?? DEFAULT_COLOR;
  const icon =
    input.icon && GOAL_ICONS.includes(input.icon) ? input.icon : DEFAULT_ICON;

  // Place new goals at the end of the current order.
  const maxOrder = await db.goal.aggregate({ _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const goal = await db.goal.create({
    data: {
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

  const created = await loadGoal(goal.id);
  if (!created) throw new Error("Goal vanished after create");
  return created;
}

/** Updates the provided fields; throws HttpError(404) if the goal does not exist. */
export async function updateGoal(id: string, input: UpdateGoalInput): Promise<void> {
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
  try {
    await db.goal.update({ where: { id }, data: update });
  } catch (error) {
    translatePrismaError(error);
  }
}

/** Deletes a goal and its check-ins; throws HttpError(404) if it does not exist. */
export async function deleteGoal(id: string): Promise<void> {
  try {
    await db.goal.delete({ where: { id } });
  } catch (error) {
    translatePrismaError(error);
  }
}

export async function reorderGoals(ids: string[]): Promise<void> {
  await db.$transaction(
    ids.map((id, index) =>
      db.goal.update({ where: { id }, data: { order: index } }),
    ),
  );
}

/**
 * Toggles a check-in for one goal+date. Returns true when the check-in was
 * created, false when it was removed. Race-safe: two concurrent toggles on
 * a missing check-in resolve to one create (the loser hits the unique
 * constraint and removes instead of erroring).
 */
export async function toggleCheckIn(id: string, dateKey: string): Promise<boolean> {
  try {
    await db.checkIn.create({ data: { goalId: id, date: dateKey } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Already checked in for that date → this toggle means "un-check".
      await db.checkIn.deleteMany({ where: { goalId: id, date: dateKey } });
      return false;
    }
    translatePrismaError(error);
  }
}

export async function removeCheckIn(id: string, dateKey: string): Promise<void> {
  await db.checkIn.deleteMany({ where: { goalId: id, date: dateKey } });
}
