import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "../db";

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
