/**
 * Integration tests for the auth api.
 *
 * Runs against a THROWAWAY postgres database (streakly_auth_test on the
 * compose container), created and dropped per run. The dev database is
 * never touched.
 */
import { afterAll, beforeAll, describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../.."); // repo root (test dir is apps/api/test)
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_auth_test";
process.env.DATABASE_URL = TEST_DB_URL;
(process.env as Record<string, string>).NODE_ENV = "test";

const psql = (sql: string) =>
  execSync(
    `docker exec streakly-db-1 psql -U streakly -d postgres -c "${sql}"`,
    { env: { ...process.env }, stdio: "pipe" },
  );

beforeAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_auth_test;");
  psql("CREATE DATABASE streakly_auth_test;");
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
  psql("DROP DATABASE IF EXISTS streakly_auth_test;");
});

const { default: app } = await import("../src/index");

const USER = {
  name: "Test User",
  email: "test@example.com",
  password: "correct-horse-battery",
};

const signUp = async () =>
  app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USER),
  });

const signIn = async () =>
  app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER.email, password: USER.password }),
  });

describe("auth api", () => {
  it("POST sign-up creates a user + credential account", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: USER.email } });
    expect(user).toBeTruthy();
    const account = await db.account.findFirst({
      where: { userId: user!.id, providerId: "credential" },
    });
    // The password lives on the account (the login method), never the user.
    expect(account?.password).toBeTruthy();
    expect(user!.name).toBe(USER.name);
  });

  it("duplicate sign-up is rejected", async () => {
    const res = await signUp();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("sign-up with a too-short password is rejected", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...USER, email: "short@test.dev", password: "short" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: "short@test.dev" } });
    expect(user).toBeNull();
  });

  it("sign-in returns a session; wrong password is rejected", async () => {
    const ok = await signIn();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("session_token=");

    const bad = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.email, password: "wrong" }),
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it("session token resolves to the user via get-session", async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    const token =
      (res.headers.get("set-cookie") ?? "").match(/session_token=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    const me = await app.request("/api/auth/get-session", {
      headers: { cookie: `better-auth.session_token=${token}` },
    });
    expect(me.status).toBe(200);
    const session = await me.json();
    expect(session?.user.email).toBe(USER.email);
  });

  it("no cookie → no session", async () => {
    const res = await app.request("/api/auth/get-session");
    const session = await res.json();
    expect(session).toBeFalsy();
  });
});
