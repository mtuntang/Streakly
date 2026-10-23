/**
 * Seeds the demo account with goals and realistic streak history.
 * Run manually:
 *   bun run db:seed                      seeds only if the DB has no goals
 *   bun run --env-file=.env prisma/seed.ts --reset
 *                                        replaces the demo account's goals
 *                                        (other users are never touched)
 * Never runs automatically — demo scaffolding must not hit a real user's DB.
 *
 * Goals are owned by a demo user created through the REAL sign-up flow
 * (app.request -> Better Auth), so the credential account/password hash is
 * exactly what a live login would expect. Sign in with:
 *   demo@streakly.dev / demo-password-123
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_GOALS, demoCreatedAt, demoHistory } from "@streakly/shared";

const db = new PrismaClient();

const DEMO_USER = {
  name: "Demo User",
  email: "demo@streakly.dev",
  password: "demo-password-123",
  // The seeding machine's zone, so the api's "today" for the demo user is
  // the same local day the check-ins below are generated from.
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Returns the demo user's id, creating the user through the real sign-up
 * endpoint if it doesn't exist yet. Reusing an existing user lets the seed
 * rerun after goals were deleted. The app is imported here, so the runner
 * must load env first.
 */
async function ensureDemoUser(): Promise<{ id: string }> {
  const existing = await db.user.findUnique({ where: { email: DEMO_USER.email } });
  if (existing) return { id: existing.id };

  const { app } = await import("../apps/api/src/app");
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

/**
 * Seeds the demo user and sample goals. Without --reset it does nothing
 * when the database already has goals; with --reset it deletes the demo
 * account's goals (their check-ins go with them) and seeds fresh ones.
 * Refuses to run in production, because the demo password is public and
 * anyone could sign in to the demo account on a live site.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }
  const reset = process.argv.includes("--reset");
  if (!reset) {
    const count = await db.goal.count();
    if (count > 0) {
      console.log(`DB already has ${count} goals — skipping seed (pass --reset to replace the demo goals).`);
      return;
    }
  }

  const { id: userId } = await ensureDemoUser();
  console.log("Demo user:", DEMO_USER.email, `(${userId})`);

  const today = new Date();
  const goals = DEMO_GOALS.map((s, order) => ({
    goal: {
      userId,
      order,
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      schedule: (s.schedule ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      createdAt: demoCreatedAt(s, today),
    },
    // The local calendar day, which is the demo user's "today" in the
    // api (their zone is this machine's). toISOString would give the UTC
    // day, which is already tomorrow on a US evening.
    dates: demoHistory(s, today).map((key) => new Date(key)),
  }));

  // One transaction, so a failure never leaves a half-seeded account that
  // the "already has goals" check would then skip forever.
  await db.$transaction(
    async (tx) => {
      if (reset) {
        const { count } = await tx.goal.deleteMany({ where: { userId } });
        console.log(`Removed ${count} demo goals.`);
      }
      for (const { goal, dates } of goals) {
        const created = await tx.goal.create({ data: goal });
        await tx.checkIn.createMany({ data: dates.map((date) => ({ goalId: created.id, date })) });
        console.log(`Seeded: ${goal.name} (${dates.length} check-ins)`);
      }
    },
    { timeout: 30_000 },
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
