import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadGoals } from "@/lib/goals-api";
import { toKey, fromKey } from "@/lib/streaks";

const CheckInSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle a check-in for a given date (defaults to today).
 * If a check-in exists for that date it is removed, otherwise it is created.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const goal = await db.goal.findUnique({ where: { id } });
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = CheckInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const dateKey = parsed.data.date ?? toKey(new Date());
    // Validate the key actually parses to a real date.
    try {
      fromKey(dateKey);
    } catch {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const existing = await db.checkIn.findUnique({
      where: { goalId_date: { goalId: id, date: dateKey } },
    });

    let checked: boolean;
    if (existing) {
      await db.checkIn.delete({ where: { id: existing.id } });
      checked = false;
    } else {
      await db.checkIn.create({ data: { goalId: id, date: dateKey } });
      checked = true;
    }

    const goals = await loadGoals();
    const updated = goals.find((g) => g.id === id);
    return NextResponse.json({ checked, goal: updated });
  } catch (error) {
    console.error("Failed to toggle check-in:", error);
    return NextResponse.json(
      { error: "Failed to update check-in. Please try again." },
      { status: 500 },
    );
  }
}

/** Explicitly remove a check-in for a date (?date=YYYY-MM-DD). */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const goal = await db.goal.findUnique({ where: { id } });
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? toKey(new Date());

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }

    await db.checkIn.deleteMany({ where: { goalId: id, date } });
    const goals = await loadGoals();
    const updated = goals.find((g) => g.id === id);
    return NextResponse.json({ checked: false, goal: updated });
  } catch (error) {
    console.error("Failed to delete check-in:", error);
    return NextResponse.json(
      { error: "Failed to remove check-in." },
      { status: 500 },
    );
  }
}