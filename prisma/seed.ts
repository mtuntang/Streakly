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
import { toKey, type Schedule } from "@streakly/shared";

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
 * One demo goal and the shape of its history. Check-ins are generated, not
 * listed, so the cards show a believable 18-week heatmap:
 * - `days`: how far back the history goes (the goal's age).
 * - `rate`: the chance a scheduled day (or a weekly quota) was met, before
 *   the current streak.
 * - `streak`: the last N scheduled days before today are all done, and the
 *   scheduled day before them is missed, so the streak is exactly N.
 * - `today`: whether today is already checked in.
 */
type Sample = {
  name: string;
  description: string | null;
  color: string;
  icon: string;
  schedule: Schedule | null;
  days: number;
  rate: number;
  streak: number;
  today: boolean;
};

const WEEKS_18 = 126;

// Together these cover every state a card can show: long and short daily
// streaks, done and still due today, weekdays goals with rest days, weekly
// quotas in progress, a broken streak, and a brand-new goal.
const samples: Sample[] = [
  { name: "Morning Workout", description: "30 minutes of movement to start the day.", color: "orange", icon: "Dumbbell", schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, days: WEEKS_18, rate: 0.85, streak: 15, today: true },
  { name: "Drink 2L Water", description: "Stay hydrated all day.", color: "teal", icon: "Droplets", schedule: null, days: WEEKS_18, rate: 0.9, streak: 64, today: true },
  { name: "Read 20 Pages", description: "Feed the mind every night.", color: "violet", icon: "BookOpen", schedule: { type: "weekly", timesPerWeek: 4 }, days: WEEKS_18, rate: 0.9, streak: 0, today: false },
  { name: "Meditate", description: "10 minutes of calm.", color: "rose", icon: "Brain", schedule: null, days: 40, rate: 0.5, streak: 9, today: false },
  { name: "Walk 10k Steps", description: null, color: "emerald", icon: "Footprints", schedule: null, days: WEEKS_18, rate: 0.7, streak: 4, today: true },
  { name: "Learn French", description: "One lesson, every day.", color: "amber", icon: "Languages", schedule: null, days: 90, rate: 0.8, streak: 21, today: false },
  { name: "Journal", description: "Three lines before bed.", color: "pink", icon: "PencilLine", schedule: null, days: WEEKS_18, rate: 0.6, streak: 0, today: false },
  { name: "Lights Out by 11", description: null, color: "lime", icon: "Moon", schedule: null, days: 60, rate: 0.75, streak: 6, today: false },
  { name: "Cycle to Work", description: "Mon, Wed and Fri.", color: "emerald", icon: "Bike", schedule: { type: "weekdays", days: [1, 3, 5] }, days: WEEKS_18, rate: 0.8, streak: 8, today: false },
  { name: "Practice Guitar", description: "Scales first, then songs.", color: "amber", icon: "Music", schedule: { type: "weekly", timesPerWeek: 3 }, days: 70, rate: 0.8, streak: 0, today: true },
  { name: "No-Spend Day", description: null, color: "teal", icon: "PiggyBank", schedule: { type: "weekly", timesPerWeek: 5 }, days: 45, rate: 0.7, streak: 0, today: false },
  { name: "Water the Plants", description: "Sunday and Wednesday.", color: "lime", icon: "Sprout", schedule: { type: "weekdays", days: [0, 3] }, days: WEEKS_18, rate: 0.9, streak: 10, today: false },
  { name: "Stretch", description: "Just started this one.", color: "rose", icon: "Heart", schedule: null, days: 1, rate: 0, streak: 0, today: false },
];

/** A small seeded random generator, so every reseed gives the same history. */
function random(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The local day `n` days before `today`. */
function daysAgo(today: Date, n: number): Date {
  const d = new Date(today);
  d.setDate(today.getDate() - n);
  return d;
}

/** Returns the days (local, oldest first) the sample was checked in. */
function historyFor(s: Sample, today: Date): Date[] {
  const rng = random(s.name);
  const done: Date[] = [];

  if (s.schedule?.type === "weekly") {
    // Week by week (weeks start on Sunday). A met week fills its quota on
    // random days, a missed week falls one short. This week stops one short
    // of the quota, so the card shows quota progress.
    const quota = s.schedule.timesPerWeek;
    const byWeek = new Map<string, Date[]>();
    for (let n = s.days - 1; n >= 1; n--) {
      const d = daysAgo(today, n);
      const key = toKey(daysAgo(d, d.getDay()));
      byWeek.set(key, [...(byWeek.get(key) ?? []), d]);
    }
    const thisWeek = toKey(daysAgo(today, today.getDay()));
    for (const [key, week] of byWeek) {
      const current = key === thisWeek;
      const target = current ? quota - 1 - (s.today ? 1 : 0) : rng() < s.rate ? quota : quota - 1;
      const shuffled = [...week].sort(() => rng() - 0.5);
      done.push(...shuffled.slice(0, Math.max(0, Math.min(target, week.length))));
    }
    if (s.today) done.push(new Date(today));
    return done.sort((a, b) => a.getTime() - b.getTime());
  }

  const days = s.schedule?.type === "weekdays" ? s.schedule.days : [0, 1, 2, 3, 4, 5, 6];
  // Scheduled days before today, newest first.
  const scheduled: Date[] = [];
  for (let n = 1; n < s.days; n++) {
    const d = daysAgo(today, n);
    if (days.includes(d.getDay())) scheduled.push(d);
  }
  scheduled.forEach((d, i) => {
    if (i < s.streak) done.push(d);
    else if (i > s.streak && rng() < s.rate) done.push(d);
    // i === streak: the missed day just before the current streak.
  });
  if (s.today) done.push(new Date(today));
  return done.sort((a, b) => a.getTime() - b.getTime());
}

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
  const goals = samples.map((s, order) => ({
    goal: {
      userId,
      order,
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      schedule: (s.schedule ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      createdAt: daysAgo(today, s.days - 1),
    },
    // The local calendar day, which is the demo user's "today" in the
    // api (their zone is this machine's). toISOString would give the UTC
    // day, which is already tomorrow on a US evening.
    dates: historyFor(s, today).map((d) => new Date(toKey(d))),
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
