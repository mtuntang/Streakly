/**
 * Input-limit tests for the api: body type and size, goal count, check-in
 * dates, and profile field lengths.
 *
 * Runs against its own THROWAWAY database (streakly_limits_test on the
 * compose container), created and dropped per run.
 */
import { afterAll, beforeAll, describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../..");
const TEST_DB_URL =
  process.env.TEST_LIMITS_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_limits_test";
process.env.DATABASE_URL = TEST_DB_URL;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const psql = (sql: string) =>
  execSync(`docker exec streakly-db-1 psql -U streakly -d postgres -c "${sql}"`, {
    env: { ...process.env },
    stdio: "pipe",
  });

beforeAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_limits_test;");
  psql("CREATE DATABASE streakly_limits_test;");
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
  psql("DROP DATABASE IF EXISTS streakly_limits_test;");
});

const { app } = await import("../src/app");
const { createTestApi } = await import("./test-api");
const { MAX_GOALS_PER_USER } = await import("../src/lib/goals");
const { MAX_NAME_LENGTH, todayKeyIn } = await import("@streakly/shared");

const JSON_HEADERS = { "Content-Type": "application/json" };
const ORIGIN = "http://localhost:3000";

const signUp = (email: string, name = "Limits") =>
  app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password: "limits-password-1" }),
  });

async function cookieFor(email: string): Promise<string> {
  const res = await signUp(email);
  expect(res.status).toBe(200);
  return `better-auth.session_token=${res.headers.get("set-cookie")!.match(/session_token=([^;]+)/)![1]}`;
}

/** Returns "YYYY-MM-DD" `days` days after `key`. */
const plusDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe("request bodies", () => {
  it("goal writes accept only application/json bodies (415 otherwise)", async () => {
    const cookie = await cookieFor("type@test.dev");
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
      const res = await app.request("/api/goals", {
        method: "POST",
        headers: { cookie, "Content-Type": type, Origin: "https://elsewhere.example" },
        body: JSON.stringify({ name: "sent as " + type }),
      });
      expect(res.status).toBe(415);
    }
    const list = await (await createTestApi(app, cookie).goals.list()).json();
    expect(list).toEqual([]);
  });

  it("bodies over 64 KiB are refused with 413 before any route runs", async () => {
    const big = JSON.stringify({ name: "x", pad: "a".repeat(70 * 1024) });
    const goals = await app.request("/api/goals", { method: "POST", headers: JSON_HEADERS, body: big });
    expect(goals.status).toBe(413);
    const auth = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: JSON_HEADERS,
      body: big,
    });
    expect(auth.status).toBe(413);
  });
});

describe("goal count", () => {
  it(`a user can have at most ${MAX_GOALS_PER_USER} goals`, async () => {
    const cookie = await cookieFor("many@test.dev");
    const api = createTestApi(app, cookie);
    const { db } = await import("../src/db");
    const user = await db.user.findUniqueOrThrow({ where: { email: "many@test.dev" } });
    await db.goal.createMany({
      data: Array.from({ length: MAX_GOALS_PER_USER - 1 }, (_, i) => ({
        userId: user.id,
        name: `g${i}`,
        order: i,
      })),
    });
    expect((await api.goals.create({ name: "last allowed" })).status).toBe(201);
    const over = await api.goals.create({ name: "one too many" });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toContain(String(MAX_GOALS_PER_USER));
  });
});

describe("check-in dates", () => {
  it("accept up to two days past today and reject later dates", async () => {
    const api = createTestApi(app, await cookieFor("dates@test.dev"));
    const goal = await (await api.goals.create({ name: "dated" })).json();
    // No zone stored: the user's today is the server's today.
    const today = todayKeyIn(null);
    expect((await api.goals.toggle(goal.id, { date: plusDays(today, 2) })).status).toBe(200);
    expect((await api.goals.toggle(goal.id, { date: plusDays(today, 3) })).status).toBe(400);
  });
});

describe("profile fields", () => {
  it(`sign-up accepts a ${MAX_NAME_LENGTH}-character name and rejects a longer one`, async () => {
    expect((await signUp("name-ok@test.dev", "n".repeat(MAX_NAME_LENGTH))).status).toBe(200);
    expect((await signUp("name-long@test.dev", "n".repeat(MAX_NAME_LENGTH + 1))).status).toBe(400);
  });

  it("update-user rejects an oversized name or image", async () => {
    const cookie = await cookieFor("profile@test.dev");
    const update = (body: object) =>
      app.request("/api/auth/update-user", {
        method: "POST",
        headers: { ...JSON_HEADERS, cookie, Origin: ORIGIN },
        body: JSON.stringify(body),
      });
    expect((await update({ name: "n".repeat(MAX_NAME_LENGTH + 1) })).status).toBe(400);
    expect((await update({ image: `https://img.example/${"a".repeat(2100)}` })).status).toBe(400);
    expect((await update({ name: "Fine Name" })).status).toBe(200);
  });
});
