import { db } from "@/lib/db";
import { computeStreaks } from "@/lib/streaks";
import type { GoalDTO } from "@/lib/goal-config";

/** Loads all goals with their check-ins and computed streak stats. */
export async function loadGoals(): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    orderBy: { createdAt: "asc" },
    include: { checkIns: { select: { date: true } } },
  });

  return goals.map((g) => {
    const dates = g.checkIns.map((c) => c.date);
    const stats = computeStreaks(dates);
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      icon: g.icon,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      checkIns: g.checkIns,
      stats,
    };
  });
}

/** Seeds a few example goals with realistic streak history if the DB is empty. */
export async function ensureSeedData(): Promise<void> {
  const count = await db.goal.count();
  if (count > 0) return;

  const samples = [
    {
      name: "Morning Workout",
      description: "30 minutes of movement to start the day.",
      color: "orange",
      icon: "Dumbbell",
      // ~5 week streak with a couple gaps
      pattern: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: "Read 20 Pages",
      description: "Feed the mind every night.",
      color: "violet",
      icon: "BookOpen",
      pattern: [1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: "Drink 2L Water",
      description: "Stay hydrated all day.",
      color: "teal",
      icon: "Droplets",
      pattern: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      name: "Meditate",
      description: "10 minutes of calm.",
      color: "rose",
      icon: "Brain",
      // short streak, started recently
      pattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
  ];

  const today = new Date();
  for (const s of samples) {
    const goal = await db.goal.create({
      data: {
        name: s.name,
        description: s.description,
        color: s.color,
        icon: s.icon,
      },
    });

    // pattern[0] is the oldest day; we map it to (today - (len-1))
    const len = s.pattern.length;
    for (let i = 0; i < len; i++) {
      if (s.pattern[i] === 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - (len - 1 - i));
        const key = d.toISOString().slice(0, 10);
        await db.checkIn.upsert({
          where: { goalId_date: { goalId: goal.id, date: key } },
          update: {},
          create: { goalId: goal.id, date: key },
        });
      }
    }
  }
}
