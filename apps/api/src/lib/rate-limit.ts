import type { MiddlewareHandler } from "hono";
import type { AuthEnv } from "./auth";
import { HttpError } from "./http";

/**
 * Per-user rate limiting for the goal routes.
 *
 * Better Auth rate-limits the auth endpoints only, so without this a signed-in
 * account can hammer goal reads (each one recomputes streak stats) or create
 * and delete goals in a loop. Limits are separate for reads and writes,
 * because a single bucket would let a burst of writes lock a user out of
 * reading their own list.
 *
 * Fixed window, in memory. It resets on restart and is not shared between
 * instances — the same tradeoff as Better Auth's limiter. Move both to Redis
 * before running more than one api container (see DEPLOY.md).
 */

type Bucket = { count: number; resetAt: number };

/** Buckets by `<userId>:<kind>`. Expired entries are swept lazily. */
const buckets = new Map<string, Bucket>();

/** Above this many live buckets, drop the expired ones on each request. */
const SWEEP_THRESHOLD = 1_000;

const limitFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** Reads are cheap per row but every list recomputes stats. */
const readLimit = () => limitFromEnv("GOALS_READS_PER_MINUTE", 120);

/** Writes are one row each, but a script could still create thousands. */
const writeLimit = () => limitFromEnv("GOALS_WRITES_PER_MINUTE", 60);

const WINDOW_MS = 60_000;

const sweep = (now: number) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

/**
 * Hono middleware. Counts one request against the caller's read or write
 * bucket and throws 429 when it is full. Mount it AFTER authenticateSession,
 * because the bucket key is the user id.
 */
export const goalRateLimit: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const userId = c.get("userId");
  if (!userId) {
    // Should be unreachable: the routers mount this after auth.
    throw new HttpError(401, "Sign in to continue.");
  }

  const now = Date.now();
  if (buckets.size > SWEEP_THRESHOLD) sweep(now);

  const write = c.req.method !== "GET" && c.req.method !== "HEAD";
  const kind = write ? "write" : "read";
  const max = write ? writeLimit() : readLimit();
  const key = `${userId}:${kind}`;

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
    throw new HttpError(429, `Too many requests. Try again in ${seconds}s.`);
  }
  return next();
};

/** Clears every bucket. Tests only: production buckets expire on their own. */
export const resetGoalRateLimits = () => buckets.clear();
