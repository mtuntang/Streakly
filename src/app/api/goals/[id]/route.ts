import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadGoals } from "@/lib/goals-api";
import { GOAL_COLORS, GOAL_ICONS } from "@/lib/goal-config";

const colorKeys = GOAL_COLORS.map((c) => c.key);

const UpdateGoalSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).optional().nullable(),
  color: z.enum(colorKeys as [string, ...string[]]).optional(),
  icon: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goals = await loadGoals();
  const goal = goals.find((g) => g.id === id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(goal);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = UpdateGoalSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const existing = await db.goal.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.color !== undefined) update.color = data.color;
  if (data.icon !== undefined && GOAL_ICONS.includes(data.icon)) {
    update.icon = data.icon;
  }

  await db.goal.update({ where: { id }, data: update });

  const goals = await loadGoals();
  const updated = goals.find((g) => g.id === id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.goal.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
