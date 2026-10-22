/** Shortest BETTER_AUTH_SECRET accepted outside development and test. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Fails loudly at boot when the api runs outside explicit development or
 * test without real auth config. Without BETTER_AUTH_SECRET, Better Auth
 * silently falls back to a well-known dev secret, which makes sessions
 * forgeable by anyone who reads the docs. Without BETTER_AUTH_URL it
 * infers its base URL from the request, which is unsafe behind a proxy
 * and weakens the origin-based CSRF check. Without RESEND_API_KEY and
 * EMAIL_FROM, password reset emails would silently never send. An unknown
 * NODE_ENV is not development, so it must present all of them too.
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
  if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY is missing");
  if (!env.EMAIL_FROM) problems.push("EMAIL_FROM is missing");
  if (problems.length === 0) return;
  const found = env.NODE_ENV === undefined ? "unset" : env.NODE_ENV;
  throw new Error(
    `Refusing to boot with NODE_ENV ${found}: ${problems.join("; ")}. ` +
      `Set a ${MIN_SECRET_LENGTH}+ character secret, the public base URL ` +
      "and the email settings in the deploy environment and restart.",
  );
}
