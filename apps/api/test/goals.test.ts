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

describe("goals api", () => {
  it("GET /goals starts empty", async () => {
    const res = await app.request("/api/goals");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /goals creates a goal (201, GoalDTO shape)", async () => {
    const res = await app.request("/api/goals", {
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
    const res = await app.request("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", schedule: { type: "weekdays", days: [] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("GET /goals/:id returns the goal; unknown id → 404", async () => {
    const ok = await app.request(`/api/goals/${createdId}`);
    expect(ok.status).toBe(200);
    const missing = await app.request("/api/goals/nope");
    expect(missing.status).toBe(404);
  });

  it("PATCH /goals/:id updates fields and returns the updated DTO", async () => {
    const res = await app.request(`/api/goals/${createdId}`, {
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
    const on = await app.request(`/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect((await on.json()).checked).toBe(true);

    const off = await app.request(`/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect((await off.json()).checked).toBe(false);
  });

  it("DELETE /:id/checkins removes a check-in explicitly", async () => {
    await app.request(`/api/goals/${createdId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await app.request(`/api/goals/${createdId}/checkins`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).checked).toBe(false);
  });

  it("PATCH /goals/reorder reorders goals", async () => {
    const second = await (
      await app.request("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Second" }),
      })
    ).json();
    const first = await (await app.request(`/api/goals/${createdId}`)).json();

    // Swap: second goal first.
    const res = await app.request("/api/goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [second.id, first.id] }),
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.map((g: { id: string }) => g.id)).toEqual([second.id, first.id]);
  });

  it("DELETE /goals/:id removes the goal", async () => {
    const res = await app.request(`/api/goals/${createdId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const list = await (await app.request("/api/goals")).json();
    expect(list.some((g: { id: string }) => g.id === createdId)).toBe(false);
  });
});
