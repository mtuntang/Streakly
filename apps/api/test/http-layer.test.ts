/**
 * The HTTP layer's unhappy edges, which nothing else covers: the health
 * probe, the 404 shape, the generic 500, request ids and the access log.
 *
 * No database and no Docker: every request here is served by the real app
 * object in-process, and the 500 case uses the real exported error handler on
 * a throwaway route.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { RequestEnv } from "../src/lib/observability";

process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
(process.env as Record<string, string>).NODE_ENV ??= "test";

const { app } = await import("../src/app");
const { handleError, requestLog } = await import("../src/lib/observability");

/** Captures console.log and console.error lines while `run` executes. */
async function captureLogs<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const record = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.log = record;
  console.error = record;
  try {
    const result = await run();
    return { result, lines };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("health probe", () => {
  it("answers 200 with a body a container healthcheck can trust", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("unknown paths", () => {
  it("answer 404 in the same JSON shape as every other error", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found." });
  });
});

describe("unexpected errors", () => {
  const throwing = new Hono<RequestEnv>()
    .use("*", requestLog)
    .get("/boom", () => {
      throw new Error("kaboom: connection string postgres://secret@db");
    })
    .onError(handleError);

  it("return a generic 500 that leaks neither the message nor a stack", async () => {
    const { result } = await captureLogs(async () => await throwing.request("/boom"));
    const body = await result.text();
    expect(result.status).toBe(500);
    expect(body).not.toContain("kaboom");
    expect(body).not.toContain("postgres://");
    expect(body).not.toContain("at ");
    expect(JSON.parse(body).error).toBe("Internal server error.");
  });

  it("log the failure with the request id that the response carries", async () => {
    const { result, lines } = await captureLogs(async () => await throwing.request("/boom"));
    const id = result.headers.get("x-request-id")!;
    expect(id).toBeTruthy();
    expect((await result.json()).requestId).toBe(id);
    expect(lines.some((line) => line.includes("Unhandled API error") && line.includes(id))).toBe(true);
  });
});

describe("request ids and the access log", () => {
  let logged: string[] = [];
  const original = console.log;
  beforeEach(() => {
    logged = [];
    console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
  });
  afterEach(() => {
    console.log = original;
  });

  it("assigns an id and echoes it on the response", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses an id the caller supplies, so a proxy's trace id survives", async () => {
    const res = await app.request("/api/health", {
      headers: { "x-request-id": "trace-from-the-edge" },
    });
    expect(res.headers.get("x-request-id")).toBe("trace-from-the-edge");
  });

  it("writes one line per request with method, path, status and duration", async () => {
    await app.request("/api/nope");
    const line = logged.find((entry) => entry.includes("/api/nope"));
    expect(line).toBeDefined();
    expect(line).toMatch(/^GET \/api\/nope 404 \d+ms id=/);
  });

  it("keeps health checks out of the log", async () => {
    await app.request("/api/health");
    expect(logged).toEqual([]);
  });

  it("never logs a query string, because reset links carry tokens there", async () => {
    await app.request("/api/nope?token=super-secret-reset-token");
    expect(logged.join("\n")).not.toContain("super-secret-reset-token");
  });
});
