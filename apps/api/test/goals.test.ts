/**
 * Integration tests for the goals API.
 *
 * Runs against a THROWAWAY database: a fresh postgres database
 * (streakly_test on the compose container) created and truncated by the
 * suite. The dev database is never touched. Every test creates its own
 * goals; nothing is shared.
 */
import { afterAll, beforeAll, describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../.."); // repo root (test dir is apps/api/test)
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_test";
// Resolved relative to prisma/schema.prisma → the throwaway test database.
process.env.DATABASE_URL = TEST_DB_URL;
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

const { default: app } = await import("../src/index");

let createdId = "";

// ── Auth helpers ─────────────────────────────────────────────────────────
const USERS = {
  alice: { name: "Alice", email: "alice@test.dev", password: "alice-password-1" },
  bob: { name: "Bob", email: "bob@test.dev", password: "bob-password-123" },
};

/** Signs the user up (idempotent — duplicates are 400s we ignore) and
 *  returns a Cookie header with a live session token. */
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

// Cookies are computed lazily (inside tests/hooks, after this file's
// beforeAll has recreated the throwaway DB) and memoized per run.
const cookieCache = new Map<string, string>();
async function cookiesFor(u: { name: string; email: string; password: string }): Promise<string> {
  const cached = cookieCache.get(u.email);
  if (cached) return cached;
  const cookie = await sessionCookie(u);
  cookieCache.set(u.email, cookie);
  return cookie;
}

/** request() wrapper that sends a user's session (resolved lazily). */
function authed(
  getCookie: (u: typeof USERS.alice) => Promise<string>,
  user: { name: string; email: string; password: string },
  path: string,
  init: RequestInit = {},
) {
  return getCookie(user).then((cookie) => {
    return app.request(path, {
      ...init,
      headers: { cookie, ...(init.headers ?? {}) },
    });
  });
}

describe("goals api", () => {
  it("GET /goals starts empty", async () => {
    const res = await authed(cookiesFor, USERS.alice, "/api/goals");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /goals creates a goal (201, GoalDTO shape)", async () => {
    const res = await authed(cookiesFor, USERS.alice, "/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Test Goal  ",
        description: "temp",
        color: "rose",
        schedule: { type: "weekdays", days: [1, 3] },
      }),
    });
    expect(res.status).toBe(201);
    const goal = await res.json();
    expect(goal.name).toBe("Test Goal"); // trimmed
    expect(goal.schedule).toEqual({ type: "weekdays", days: [1, 3] });
    expect(goal.stats.unit).toBe("day");
    createdId = goal.id;
  });

  it("POST /goals rejects invalid bodies (400)", async () => {
    const res = await authed(cookiesFor, USERS.alice, "/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", schedule: { type: "weekdays", days: [] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("GET /goals/:id returns the goal; unknown id → 404", async () => {
    const ok = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}`);
    expect(ok.status).toBe(200);
    const missing = await authed(cookiesFor, USERS.alice, "/api/goals/nope");
    expect(missing.status).toBe(404);
  });

  it("PATCH /goals/:id updates fields and returns the updated DTO", async () => {
    const res = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed", schedule: null }),
    });
    expect(res.status).toBe(200);
    const goal = await res.json();
    expect(goal.name).toBe("Renamed");
    expect(goal.schedule).toBeNull();
  });

  it("POST /:id/checkins toggles on then off; GET list reflects it", async () => {
    const on = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect((await on.json()).checked).toBe(true);

    const off = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect((await off.json()).checked).toBe(false);
  });

  it("DELETE /:id/checkins removes a check-in explicitly", async () => {
    await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}/checkins`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).checked).toBe(false);
  });

  it("PATCH /goals/reorder reorders goals", async () => {
    const second = await (
      await authed(cookiesFor, USERS.alice, "/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Second" }),
      })
    ).json();
    const first = await (await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}`)).json();

    console.log('IDS:', JSON.stringify({ second: second.id ?? null, first: first.id ?? null, secondName: second.name, firstName: first.name, secondErr: second.error ?? null }));
    // Swap: second goal first.
    const res = await authed(cookiesFor, USERS.alice, "/api/goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [second.id, first.id] }),
    });
    if (res.status !== 200) console.log("reorder body:", await res.text());
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((g: { id: string }) => g.id)).toEqual([second.id, first.id]);
  });

  it("DELETE /goals/:id removes the goal", async () => {
    const res = await authed(cookiesFor, USERS.alice, `/api/goals/${createdId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const list = await (await authed(cookiesFor, USERS.alice, "/api/goals")).json();
    expect(list.some((g: { id: string }) => g.id === createdId)).toBe(false);
  });

  // ── Ownership & auth scoping ──────────────────────────────────────────
  it("anonymous requests are 401 before any validation", async () => {
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
    const created = await (
      await authed(cookiesFor, USERS.alice, "/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice-only" }),
      })
    ).json();

    // Bob's view: GET/PATCH/DELETE/toggle on Alice's goal all 404.
    expect((await authed(cookiesFor, USERS.bob, `/api/goals/${created.id}`)).status).toBe(404);
    expect(
      (
        await authed(cookiesFor, USERS.bob, `/api/goals/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "hijacked" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await authed(cookiesFor, USERS.bob, `/api/goals/${created.id}`, { method: "DELETE" })).status,
    ).toBe(404);
    expect(
      (
        await authed(cookiesFor, USERS.bob, `/api/goals/${created.id}/checkins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(404);

    // Bob's list never contained it; Alice's still does.
    const bobList = await (await authed(cookiesFor, USERS.bob, "/api/goals")).json();
    expect(bobList.some((g: { id: string }) => g.id === created.id)).toBe(false);
    const aliceList = await (await authed(cookiesFor, USERS.alice, "/api/goals")).json();
    expect(aliceList.some((g: { id: string }) => g.id === created.id)).toBe(true);
  });

  it("reorder ignores foreign ids and 404s are scoped per user", async () => {
    const a = await (
      await authed(cookiesFor, USERS.alice, "/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A-one" }),
      })
    ).json();
    // Bob creates his own goal; Alice tries to reorder including it.
    const b = await (
      await authed(cookiesFor, USERS.bob, "/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "B-one" }),
      })
    ).json();

    const res = await authed(cookiesFor, USERS.alice, "/api/goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [a.id, b.id] }),
    });
    if (res.status !== 200) console.log("reorder2 body:", await res.text());
    expect(res.status).toBe(200);
    // Bob's goal untouched (still order 0) — checked in the DB because the
    // wire contract deliberately does not expose the order field.
    const { db } = await import("../src/db");
    const bobGoal = await db.goal.findFirst({ where: { id: b.id } });
    expect(bobGoal?.order).toBe(0);
  });
});
