/**
 * Seeds demo goals with realistic streak history if the DB is empty.
 * Run manually: bun run db:seed   (or: bun run --env-file=.env prisma/seed.ts)
 * Never runs automatically — demo scaffolding must not hit a real user's DB.
 *
 * Goals are owned by a demo user created through the REAL sign-up flow
 * (app.request -> Better Auth), so the credential account/password hash is
 * exactly what a live login would expect. Sign in with:
 *   demo@streakly.dev / demo-password-123
 */
import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_USER = {
  name: "Demo User",
  email: "demo@streakly.dev",
  password: "demo-password-123",
};


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


/** Creates the demo user through the real sign-up endpoint (idempotent —
 *  Better Auth rejects duplicates), returning the user row. The app import
 *  happens here so env must already be loaded by the runner. */
async function ensureDemoUser(): Promise<{ id: string }> {
  const { default: app } = await import("../apps/api/src/index");
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO_USER),
  });
  if (res.status !== 200) {
    throw new Error(`Demo sign-up failed (${res.status}): ${await res.text()}`);
  }
  const user = await db.user.findUnique({ where: { email: DEMO_USER.email } });
  if (!user) throw new Error("Demo user missing after sign-up");
  return { id: user.id };
}

async function main() {
  const count = await db.goal.count();
  if (count > 0) {
    console.log(`DB already has ${count} goals — skipping seed.`);
    return;
  }

  const { id: userId } = await ensureDemoUser();
  console.log("Seeded demo user:", DEMO_USER.email, `(${userId})`);

  const today = new Date();
  let order = 0;
  for (const s of samples) {
    const goal = await db.goal.create({
      data: {
        userId,
        order: order++,
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
          where: { goalId_date: { goalId: goal.id, date: new Date(key) } },
          update: {},
          create: { goalId: goal.id, date: new Date(key) },
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
