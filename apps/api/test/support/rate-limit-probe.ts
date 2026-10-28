/**
 * Child process for rate-limit.test.ts. The auth module reads NODE_ENV once,
 * when first imported, and bun runs every test file in one process, so a
 * test file cannot get a rate-limited auth instance after another suite has
 * loaded it under NODE_ENV=test. This script starts fresh with the
 * environment the parent passes, makes the requests, and prints the results
 * as one JSON line on stdout.
 */
export {};

const { app } = await import("../../src/app");
const { auth } = await import("../../src/lib/auth");
const { db } = await import("../../src/db");

const ORIGIN = "http://localhost:3000";

const signInWrong = (forwardedFor: string) =>
  app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": forwardedFor },
    body: JSON.stringify({ email: "rate@test.dev", password: "not-the-password" }),
  });

const signInStatuses: number[] = [];
for (let i = 1; i <= 6; i++) {
  signInStatuses.push((await signInWrong(`198.51.100.${i}`)).status);
}

const verifyPassword = await app.request("/api/auth/verify-password", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: ORIGIN },
  body: JSON.stringify({ password: "anything-at-all" }),
});

await db.$disconnect();
process.stdout.write(
  JSON.stringify({
    rateLimitEnabled: auth.options.rateLimit?.enabled,
    ipAddressHeaders: auth.options.advanced?.ipAddress?.ipAddressHeaders,
    signInStatuses,
    verifyPasswordStatus: verifyPassword.status,
  }) + "\n",
);
