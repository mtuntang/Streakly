/**
 * Rate-limit keying tests for the auth api.
 *
 * Rate limiting is off under NODE_ENV=test, and bun runs every test file in
 * one process, so the requests run in a child process
 * (support/rate-limit-probe.ts) started with NODE_ENV=development and
 * CLIENT_IP_HEADER unset: a deploy before the edge header is configured.
 * It uses its own THROWAWAY database (streakly_ratelimit_test on the
 * compose container).
 */
import { afterAll, beforeAll, describe, it, expect } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../..");
const TEST_DB_URL =
  process.env.TEST_RATELIMIT_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_ratelimit_test";

const psql = (sql: string) =>
  execSync(
    `docker exec streakly-db-1 psql -U streakly -d postgres -c "${sql}"`,
    { stdio: "pipe" },
  );

type ProbeResult = {
  rateLimitEnabled: boolean;
  ipAddressHeaders: string[] | undefined;
  signInStatuses: number[];
};
let result: ProbeResult;

beforeAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_ratelimit_test;");
  psql("CREATE DATABASE streakly_ratelimit_test;");
  execSync("bunx prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: TEST_DB_URL,
    BETTER_AUTH_URL: "http://localhost:3000",
  };
  delete env.CLIENT_IP_HEADER;
  const probe = spawnSync("bun", [path.join(import.meta.dir, "support/rate-limit-probe.ts")], {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  const line = probe.stdout.trim().split("\n").at(-1) ?? "";
  if (probe.status !== 0 || !line.startsWith("{")) {
    throw new Error(`rate-limit probe failed: ${probe.stderr || probe.stdout}`);
  }
  result = JSON.parse(line) as ProbeResult;
  // 40s: cold bunx + prisma startup plus the child process's own startup.
}, 40_000);

afterAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_ratelimit_test;");
});

describe("auth rate limit keying (CLIENT_IP_HEADER unset)", () => {
  it("runs with the rate limiter on and no client-supplied IP header", () => {
    expect(result.rateLimitEnabled).toBe(true);
    expect(result.ipAddressHeaders).toEqual([]);
  });

  it("a new X-Forwarded-For per request does not get a fresh sign-in budget", () => {
    // The sign-in rule allows 5 per minute; the 6th is limited although
    // every request claimed a different address.
    expect(result.signInStatuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(result.signInStatuses[5]).toBe(429);
  });
});
