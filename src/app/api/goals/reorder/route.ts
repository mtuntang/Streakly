import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loadGoals } from "@/lib/goals-api";

const ReorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function PATCH(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = ReorderSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const { ids } = parsed.data;

    // Update each goal's order to its index in the provided array.
    await db.$transaction(
      ids.map((id, index) =>
        db.goal.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    const goals = await loadGoals();
    return NextResponse.json(goals);
  } catch (error) {
    console.error("Failed to reorder goals:", error);
    return NextResponse.json(
      { error: "Failed to reorder goals." },
      { status: 500 },
    );
  }
}