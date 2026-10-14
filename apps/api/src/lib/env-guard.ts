/** Shortest BETTER_AUTH_SECRET accepted outside development and test. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Fails loudly at boot when the api runs outside explicit development or
 * test without real auth config. Without BETTER_AUTH_SECRET, Better Auth
 * silently falls back to a well-known dev secret, which makes sessions
 * forgeable by anyone who reads the docs. Without BETTER_AUTH_URL it
 * infers its base URL from the request, which is unsafe behind a proxy
 * and weakens the origin-based CSRF check. An unknown NODE_ENV is not
 * development, so it must present both too.
 */
export function assertBootEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return;
  const problems: string[] = [];
  if (!env.BETTER_AUTH_SECRET) {
    problems.push("BETTER_AUTH_SECRET is missing");
  } else if (env.BETTER_AUTH_SECRET.length < MIN_SECRET_LENGTH) {
    problems.push(
      `BETTER_AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`,
    );
  }
  if (!env.BETTER_AUTH_URL) problems.push("BETTER_AUTH_URL is missing");
  if (problems.length === 0) return;
  const found = env.NODE_ENV === undefined ? "unset" : env.NODE_ENV;
  throw new Error(
    `Refusing to boot with NODE_ENV ${found}: ${problems.join("; ")}. ` +
      `Set a ${MIN_SECRET_LENGTH}+ character secret and the public base ` +
      "URL in the deploy environment and restart.",
  );
}
