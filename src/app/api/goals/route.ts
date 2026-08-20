import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadGoals, ensureSeedData } from "@/lib/goals-api";
import { GOAL_COLORS, GOAL_ICONS } from "@/lib/goal-config";

const colorKeys = GOAL_COLORS.map((c) => c.key);

const CreateGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(280).optional().nullable(),
  color: z.enum(colorKeys as [string, ...string[]]).optional(),
  icon: z.string().optional(),
});

export async function GET() {
  try {
    await ensureSeedData();
    const goals = await loadGoals();
    return NextResponse.json(goals);
  } catch (error) {
    console.error("Failed to load goals:", error);
    return NextResponse.json(
      { error: "Failed to load goals. Please try again later." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = CreateGoalSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const color = data.color ?? "emerald";
    const icon =
      data.icon && GOAL_ICONS.includes(data.icon) ? data.icon : "Flame";

    const goal = await db.goal.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        color,
        icon,
      },
    });

    const goals = await loadGoals();
    const created = goals.find((g) => g.id === goal.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json(
      { error: "Failed to create goal. Please try again." },
      { status: 500 },
    );
  }
}