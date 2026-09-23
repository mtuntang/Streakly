/**
 * Seeds demo goals with realistic streak history if the DB is empty.
 * Run manually: bun run db:seed   (or: bun run --env-file=.env prisma/seed.ts)
 * Never runs automatically — demo scaffolding must not hit a real user's DB.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const samples = [
  {
    name: "Morning Workout",
    description: "30 minutes of movement to start the day.",
    color: "orange",
    icon: "Dumbbell",
    // weekdays cadence: Mon–Fri
    schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] },
    // ~5 week streak with a couple gaps
    pattern: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  {
    name: "Read 20 Pages",
    description: "Feed the mind every night.",
    color: "violet",
    icon: "BookOpen",
    // weekly cadence: 4× per week
    schedule: { type: "weekly", timesPerWeek: 4 },
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

async function main() {
  const count = await db.goal.count();
  if (count > 0) {
    console.log(`DB already has ${count} goals — skipping seed.`);
    return;
  }

  const today = new Date();
  for (const s of samples) {
    const goal = await db.goal.create({
      data: {
        name: s.name,
        description: s.description,
        color: s.color,
        icon: s.icon,
        schedule: (s.schedule ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    });

    // pattern[0] is the oldest day; map it to (today - (len-1)).
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
    console.log("Seeded:", s.name);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
