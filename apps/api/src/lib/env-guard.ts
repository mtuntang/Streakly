/**
 * Fails loudly at boot when the api is not running as a known dev
 * environment without a BETTER_AUTH_SECRET: Better Auth silently falls
 * back to a hardcoded well-known dev secret in that case, which makes
 * sessions forgeable by anyone who reads the docs — so anything other
 * than explicit development must present a real secret or exit.
 */
export function assertBootEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return;
  if (!env.BETTER_AUTH_SECRET) {
    const found = env.NODE_ENV === undefined ? "unset" : env.NODE_ENV;
    throw new Error(
      `BETTER_AUTH_SECRET is required when NODE_ENV is ${found} — ` +
        "Better Auth would silently use a well-known dev secret, making " +
        "sessions forgeable. Generate a 32+ byte secret into the deploy " +
        "environment and restart.",
    );
  }
}
