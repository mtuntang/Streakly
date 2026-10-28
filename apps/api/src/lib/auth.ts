import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Context, Next } from "hono";
import { MIN_PASSWORD_LENGTH, TimeZoneSchema } from "@streakly/shared";
import { db } from "../db";
import { assertBootEnv } from "./env-guard";
import { unauthorized } from "./http";
import { resetPasswordEmail, sendEmail } from "./mailer";

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
    // The email is sent without awaiting it, so a request for a registered
    // address answers as fast as one for an unknown address. Waiting on
    // the email provider would reveal which emails have accounts.
    sendResetPassword: async ({ user, url }) => {
      sendEmail(resetPasswordEmail(user.email, url)).catch((error) =>
        console.error("Password reset email failed", error),
      );
    },
    revokeSessionsOnPasswordReset: true,
  },
  // The user's IANA zone decides which civil day "today" is for their
  // streaks. The browser sends it at sign-up and via update-user when it
  // changes; it is optional so users who signed up before it existed keep
  // working until their next visit fills it in.
  user: {
    additionalFields: {
      timezone: {
        type: "string",
        required: false,
        input: true,
        validator: { input: TimeZoneSchema },
      },
    },
  },
  // Better Auth skips its origin (CSRF) check under NODE_ENV=test by
  // default. Forcing it on keeps tests exercising the same check that
  // runs in development and production.
  //
  // The client IP keys the rate limit. Every request reaches the api through
  // the web app's proxy, which forwards the browser's headers unchanged and
  // adds no IP of its own, so only a header set by the host's edge proxy can
  // be trusted. Which header that is depends on the host (x-real-ip on
  // Railway, fly-client-ip on Fly), so CLIENT_IP_HEADER names it.
  // Unset, the list is empty rather than undefined: undefined would make
  // Better Auth fall back to x-forwarded-for, which any client can set to
  // get a fresh bucket per request. Empty means no IP, so all users share
  // one rate-limit bucket in production until the header is configured.
  advanced: {
    disableOriginCheck: false,
    ipAddress: {
      ipAddressHeaders: process.env.CLIENT_IP_HEADER
        ? [process.env.CLIENT_IP_HEADER]
        : [],
    },
  },
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
      "/change-password": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
});

/**
 * Context variables set by authenticateSession. Routers declare this type
 * so `c.get("userId")` is a typed string: a misspelled key fails to
 * compile instead of reading undefined, which Prisma would treat as "no
 * filter" and return every user's rows. timeZone is the user's stored
 * IANA zone, or null until the browser has sent one.
 */
export type AuthEnv = { Variables: { userId: string; timeZone: string | null } };

/**
 * Resolves the session from the request cookie and puts the user id and
 * time zone on the context, or throws 401 when there is no session. Every
 * goals route mounts it before body validation, so a 401 never depends on
 * the shape of the body.
 */
export async function authenticateSession(
  c: Context<AuthEnv>,
  next: Next,
): Promise<void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw unauthorized();
  c.set("userId", session.user.id);
  c.set("timeZone", session.user.timezone ?? null);
  await next();
}
