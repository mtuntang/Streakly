import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Context, Next } from "hono";
import { db } from "../db";
import { unauthorized } from "./http";

/**
 * Auth for the api. Email/password only for now — the account table's
 * providerId/accountId shape is what makes "add Google later" an insert,
 * not a migration. Better Auth owns the user/session/account/verification
 * tables; app code only ever consumes session.user.id.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
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
