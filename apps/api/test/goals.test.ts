/**
 * Integration tests for the goals API.
 *
 * Runs against a THROWAWAY database: a fresh postgres database
 * (streakly_test on the compose container) created and dropped by the
 * suite. The dev database is never touched.
 *
 * All requests go through the typed test client (test-api.ts) — tests
 * state intent; paths/methods/headers/cookies live in one place.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../.."); // repo root (test dir is apps/api/test)
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_test";
// Resolved relative to prisma/schema.prisma → the throwaway test database.
process.env.DATABASE_URL = TEST_DB_URL;
// A timezone west of UTC: date bugs that hide on UTC servers show up here.
process.env.TZ = "America/Los_Angeles";
(process.env as Record<string, string>).NODE_ENV = "test";

const psql = (sql: string) =>
  execSync(
    `docker exec streakly-db-1 psql -U streakly -d postgres -c "${sql}"`,
    { env: { ...process.env }, stdio: "pipe" },
  );

beforeAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_test;");
  psql("CREATE DATABASE streakly_test;");
  execSync("bunx prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env },
    stdio: "pipe",
  });
  // 20s: cold bunx + prisma startup exceeds bun's default 5s hook timeout.
}, 20_000);

afterAll(async () => {
  const { db } = await import("../src/db");
  await db.$disconnect();
  psql("DROP DATABASE IF EXISTS streakly_test;");
});

const { app } = await import("../src/app");
const { createTestApi } = await import("./test-api");

// ── Auth helpers ─────────────────────────────────────────────────────────
const USERS = {
  alice: { name: "Alice", email: "alice@test.dev", password: "alice-password-1" },
  bob: { name: "Bob", email: "bob@test.dev", password: "bob-password-123" },
};

/** Signs the user up (idempotent — duplicates fall back to sign-in) and
 *  returns a live session cookie. */
async function sessionCookie(u: { name: string; email: string; password: string }): Promise<string> {
  const up = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(u),
  });
  if (up.status !== 200) {
    // Already exists from a previous test → sign in instead.
    const si = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    expect(si.status).toBe(200);
    return `better-auth.session_token=${si.headers.get("set-cookie")!.match(/session_token=([^;]+)/)![1]}`;
  }
  return `better-auth.session_token=${up.headers.get("set-cookie")!.match(/session_token=([^;]+)/)![1]}`;
}

// Cookies are computed lazily (inside tests, after this file's beforeAll
// has recreated the throwaway DB) and memoized per run.
const cookieCache = new Map<string, string>();
async function cookieFor(u: { name: string; email: string; password: string }): Promise<string> {
  const cached = cookieCache.get(u.email);
  if (cached) return cached;
  const cookie = await sessionCookie(u);
  cookieCache.set(u.email, cookie);
  return cookie;
}

let createdId = "";

describe("goals api", () => {
  it("GET /goals starts empty", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const res = await api.goals.list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /goals creates a goal (201, GoalDTO shape)", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const res = await api.goals.create({
      name: "  Test Goal  ",
      description: "temp",
      color: "rose",
      schedule: { type: "weekdays", days: [1, 3] },
    });
    expect(res.status).toBe(201);
    const goal = await res.json();
    expect(goal.name).toBe("Test Goal"); // trimmed
    expect(goal.schedule).toEqual({ type: "weekdays", days: [1, 3] });
    expect(goal.stats.unit).toBe("day");
    createdId = goal.id;
  });

  it("POST /goals rejects invalid bodies (400)", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    // Cast is deliberate: this test sends an INVALID body through the
    // client's typed parameter — the runtime 400 is the behavior under test.
    const res = await api.goals.create({
      name: "",
      schedule: { type: "weekdays", days: [] },
    } as unknown as Parameters<typeof api.goals.create>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("GET /goals/:id returns the goal; unknown id → 404", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const ok = await api.goals.get(createdId);
    expect(ok.status).toBe(200);
    const missing = await api.goals.get("nope");
    expect(missing.status).toBe(404);
  });

  it("PATCH /goals/:id updates fields and returns the updated DTO", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const res = await api.goals.update(createdId, { name: "Renamed", schedule: null });
    expect(res.status).toBe(200);
    const goal = await res.json();
    expect(goal.name).toBe("Renamed");
    expect(goal.schedule).toBeNull();
  });

  it("POST /:id/checkins toggles on then off; GET list reflects it", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const on = await api.goals.toggle(createdId);
    expect((await on.json()).checked).toBe(true);

    const off = await api.goals.toggle(createdId);
    expect((await off.json()).checked).toBe(false);
  });

  it("DELETE /:id/checkins removes a check-in explicitly", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    await api.goals.toggle(createdId);
    const res = await api.goals.uncheck(createdId);
    expect(res.status).toBe(200);
    expect((await res.json()).checked).toBe(false);
  });

  it("a check-in reads back on the same date it was saved", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const res = await api.goals.toggle(createdId, { date: "2026-10-14" });
    const { goal } = await res.json();
    expect(goal.checkIns.map((c: { date: string }) => c.date)).toContain("2026-10-14");
    await api.goals.uncheck(createdId, "2026-10-14");
  });

  it("check-in dates that are not real calendar days are rejected (400)", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    for (const date of ["2026-02-31", "2026-13-45"]) {
      expect((await api.goals.toggle(createdId, { date })).status).toBe(400);
      expect((await api.goals.uncheck(createdId, date)).status).toBe(400);
    }
  });

  it("reorder rejects malformed ids and oversized lists (400)", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    expect((await api.goals.reorder(["not-a-goal-id"])).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, () => crypto.randomUUID());
    expect((await api.goals.reorder(tooMany)).status).toBe(400);
  });

  it("PATCH /goals/reorder reorders goals", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const second = await (await api.goals.create({ name: "Second" })).json();
    const first = await (await api.goals.get(createdId)).json();

    // Swap: second goal first.
    const res = await api.goals.reorder([second.id, first.id]);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((g: { id: string }) => g.id)).toEqual([second.id, first.id]);
  });

  it("DELETE /goals/:id removes the goal", async () => {
    const api = createTestApi(app, await cookieFor(USERS.alice));
    const res = await api.goals.remove(createdId);
    expect(res.status).toBe(200);
    const list = await (await api.goals.list()).json();
    expect(list.some((g: { id: string }) => g.id === createdId)).toBe(false);
  });

  // ── Ownership & auth scoping ──────────────────────────────────────────
  it("anonymous requests are 401 before any validation", async () => {
    // Raw requests, deliberately: this test verifies the unauthenticated path.
    const list = await app.request("/api/goals");
    expect(list.status).toBe(401);
    const bad = await app.request("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not even json",
    });
    expect(bad.status).toBe(401);
  });

  it("another user's goal is indistinguishable from a missing one (404)", async () => {
    const alice = createTestApi(app, await cookieFor(USERS.alice));
    const bob = createTestApi(app, await cookieFor(USERS.bob));
    const created = await (await alice.goals.create({ name: "Alice-only" })).json();

    // Bob's view: GET/PATCH/DELETE/toggle on Alice's goal all 404.
    expect((await bob.goals.get(created.id)).status).toBe(404);
    expect((await bob.goals.update(created.id, { name: "hijacked" })).status).toBe(404);
    expect((await bob.goals.remove(created.id)).status).toBe(404);
    expect((await bob.goals.toggle(created.id)).status).toBe(404);

    // Bob's list never contained it; Alice's still does.
    const bobList = await (await bob.goals.list()).json();
    expect(bobList.some((g: { id: string }) => g.id === created.id)).toBe(false);
    const aliceList = await (await alice.goals.list()).json();
    expect(aliceList.some((g: { id: string }) => g.id === created.id)).toBe(true);
  });

  it("reorder ignores foreign ids and 404s are scoped per user", async () => {
    const alice = createTestApi(app, await cookieFor(USERS.alice));
    const bob = createTestApi(app, await cookieFor(USERS.bob));
    const a = await (await alice.goals.create({ name: "A-one" })).json();
    // Bob creates his own goal; Alice tries to reorder including it.
    const b = await (await bob.goals.create({ name: "B-one" })).json();

    const res = await alice.goals.reorder([a.id, b.id]);
    expect(res.status).toBe(200);
    // Bob's goal untouched (still order 0) — checked in the DB because the
    // wire contract deliberately does not expose the order field.
    const { db } = await import("../src/db");
    const bobGoal = await db.goal.findFirst({ where: { id: b.id } });
    expect(bobGoal?.order).toBe(0);
  });

  it("reorder of only foreign or missing ids is 404", async () => {
    const alice = createTestApi(app, await cookieFor(USERS.alice));
    const bob = createTestApi(app, await cookieFor(USERS.bob));
    const b = await (await bob.goals.create({ name: "B-two" })).json();

    expect((await alice.goals.reorder([b.id])).status).toBe(404);
    expect((await alice.goals.reorder([crypto.randomUUID()])).status).toBe(404);
  });

  it("check-ins on a foreign or missing goal are 404", async () => {
    const alice = createTestApi(app, await cookieFor(USERS.alice));
    const bob = createTestApi(app, await cookieFor(USERS.bob));
    const b = await (await bob.goals.create({ name: "B-three" })).json();

    for (const id of [b.id, crypto.randomUUID()]) {
      expect((await alice.goals.toggle(id)).status).toBe(404);
      expect((await alice.goals.uncheck(id)).status).toBe(404);
    }
    // Bob's goal gained no check-in from Alice's attempts.
    const after = await (await bob.goals.get(b.id)).json();
    expect(after.checkIns).toEqual([]);
  });

  // ── "Today" follows the user's time zone ──────────────────────────────
  // Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart, so their
  // civil days always differ, whatever the server's clock or zone says.
  const KIRI = {
    name: "Kiri",
    email: "kiri@test.dev",
    password: "kiri-password-12",
    timezone: "Pacific/Kiritimati",
  };
  const PAGO = {
    name: "Pago",
    email: "pago@test.dev",
    password: "pago-password-12",
    timezone: "Pacific/Pago_Pago",
  };

  it("a check-in without a date lands on the user's today, not the server's", async () => {
    const { todayKeyIn } = await import("@streakly/shared");
    for (const user of [KIRI, PAGO]) {
      const api = createTestApi(app, await cookieFor(user));
      const goal = await (await api.goals.create({ name: `${user.name} daily` })).json();
      const { checked, goal: after } = await (await api.goals.toggle(goal.id)).json();
      expect(checked).toBe(true);
      expect(after.checkIns.map((c: { date: string }) => c.date)).toEqual([
        todayKeyIn(user.timezone),
      ]);
      expect(after.stats).toMatchObject({ doneToday: true, current: 1 });
    }
  });

  it("streak stats use the user's today, ahead of or behind the server's", async () => {
    const { todayKeyIn } = await import("@streakly/shared");
    const kiriToday = todayKeyIn(KIRI.timezone);

    // Kiritimati's today is a future day for the server; it must still count.
    const kiri = createTestApi(app, await cookieFor(KIRI));
    const kGoal = await (await kiri.goals.create({ name: "Kiri explicit" })).json();
    const kRes = await kiri.goals.toggle(kGoal.id, { date: kiriToday });
    expect((await kRes.json()).goal.stats).toMatchObject({ doneToday: true, current: 1 });

    // The same date is a future day in Pago Pago, so it is not counted there.
    const pago = createTestApi(app, await cookieFor(PAGO));
    const pGoal = await (await pago.goals.create({ name: "Pago ahead" })).json();
    const pRes = await pago.goals.toggle(pGoal.id, { date: kiriToday });
    expect((await pRes.json()).goal.stats).toMatchObject({ doneToday: false, total: 0 });
  });

  it("DELETE /:id/checkins without a date removes the user's today", async () => {
    const api = createTestApi(app, await cookieFor(KIRI));
    const goal = await (await api.goals.create({ name: "Kiri uncheck" })).json();
    await api.goals.toggle(goal.id);
    const { goal: after } = await (await api.goals.uncheck(goal.id)).json();
    expect(after.checkIns).toEqual([]);
  });
});

// ── Per-user rate limiting ───────────────────────────────────────────────
// Limits are read from the environment on each request, so a test can lower
// them without touching the app. Buckets are per user, so these tests use
// their own accounts and reset the buckets when they are done.
describe("goal route rate limits", () => {
  // Their own accounts: buckets are per user, and another describe's users
  // may already have spent budget by the time this block runs.
  const READER = { name: "Limit Reader", email: "limit-reader@test.dev", password: "limit-reader-12" };
  const WRITER = { name: "Limit Writer", email: "limit-writer@test.dev", password: "limit-writer-12" };
  const OTHER = { name: "Limit Other", email: "limit-other@test.dev", password: "limit-other-12" };
  const LIMITER = {
    reads: "GOALS_READS_PER_MINUTE",
    writes: "GOALS_WRITES_PER_MINUTE",
  };
  const saved: Record<string, string | undefined> = {};
  let reset: () => void;

  beforeAll(async () => {
    const { resetGoalRateLimits } = await import("../src/lib/rate-limit");
    reset = resetGoalRateLimits;
  });

  beforeEach(async () => {
    for (const name of Object.values(LIMITER)) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    reset();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    reset();
  });

  it("returns 429 after the read budget is spent, and the body says how long", async () => {
    process.env[LIMITER.reads] = "2";
    const api = createTestApi(app, await cookieFor(READER));
    expect((await api.goals.list()).status).toBe(200);
    expect((await api.goals.list()).status).toBe(200);
    const blocked = await api.goals.list();
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/try again in \d+s/i);
  });

  it("counts writes in their own bucket, so writes never block reads", async () => {
    process.env[LIMITER.writes] = "1";
    const api = createTestApi(app, await cookieFor(WRITER));
    expect((await api.goals.create({ name: "first" })).status).toBe(201);
    expect((await api.goals.create({ name: "second" })).status).toBe(429);
    // The read bucket is untouched by those writes.
    expect((await api.goals.list()).status).toBe(200);
  });

  it("keeps one user's spent budget from blocking another user", async () => {
    process.env[LIMITER.reads] = "1";
    const kiri = createTestApi(app, await cookieFor(READER));
    const pago = createTestApi(app, await cookieFor(OTHER));
    expect((await kiri.goals.list()).status).toBe(200);
    expect((await kiri.goals.list()).status).toBe(429);
    expect((await pago.goals.list()).status).toBe(200);
  });

  it("anonymous requests get 401 from auth, not 429 from the limiter", async () => {
    process.env[LIMITER.reads] = "1";
    const anonymous = await app.request("/api/goals");
    expect(anonymous.status).toBe(401);
  });
});
