import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Context, Next } from "hono";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { db } from "../db";
import { assertBootEnv } from "./env-guard";
import { unauthorized } from "./http";

// Runs before betterAuth() reads the secret and base URL, so a deploy
// missing either fails here instead of building auth on dev defaults.
assertBootEnv();

/**
 * Auth for the api. Email/password only for now — the account table's
 * providerId/accountId shape is what makes "add Google later" an insert,
 * not a migration. Better Auth owns the user/session/account/verification
 * tables; app code only ever consumes session.user.id.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // BETTER_AUTH_URL must be the WEB origin the browser sees, not the api's
  // own address: requests arrive through the web app's /api proxy, and the
  // origin check compares the browser's Origin header against this value.
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  // Better Auth skips its origin (CSRF) check under NODE_ENV=test by
  // default. Forcing it on keeps tests exercising the same check that
  // runs in development and production.
  advanced: { disableOriginCheck: false },
  // Rate limiting is on everywhere except bun test: a suite makes hundreds
  // of in-process requests from one IP inside a single window, which would
  // exhaust the limit and fail unrelated tests.
  rateLimit: {
    enabled: process.env.NODE_ENV !== "test",
    window: 60,
    max: 100,
    // Credential endpoints get a much tighter budget than the general API.
    // Keys are exact paths; the option must be named customRules, because
    // Better Auth silently ignores unknown option keys.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
});

/**
 * Route guard: resolves the session from the request cookie and puts the
 * user id on the context. Every goals route mounts this BEFORE validation —
 * a 401 must never depend on the shape of the body.
 */
export async function authenticateSession(c: Context, next: Next): Promise<void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw unauthorized();
  c.set("userId", session.user.id);
  await next();
}
