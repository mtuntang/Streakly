/**
 * Integration tests for the auth api.
 *
 * Runs against a THROWAWAY postgres database (streakly_auth_test on the
 * compose container), created and dropped per run. The dev database is
 * never touched.
 */
import { afterAll, beforeAll, describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../.."); // repo root (test dir is apps/api/test)
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://streakly:streakly@localhost:5432/streakly_auth_test";
process.env.DATABASE_URL = TEST_DB_URL;
(process.env as Record<string, string>).NODE_ENV = "test";
// The web origin, as in dev and deploy. Requests below reach the api on a
// different host (http://localhost), like proxied requests do.
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const psql = (sql: string) =>
  execSync(
    `docker exec streakly-db-1 psql -U streakly -d postgres -c "${sql}"`,
    { env: { ...process.env }, stdio: "pipe" },
  );

beforeAll(() => {
  psql("DROP DATABASE IF EXISTS streakly_auth_test;");
  psql("CREATE DATABASE streakly_auth_test;");
  execSync("bunx prisma db push --skip-generate", {
    cwd: ROOT,
    env: { ...process.env },
    stdio: "pipe",
  });
  // 20s: cold bunx + prisma startup exceeds bun's default 5s hook timeout.
}, 20_000);

afterAll(async () => {
  const { db } = await import("../src/db");
  await db.$disconnect();
  psql("DROP DATABASE IF EXISTS streakly_auth_test;");
});

const { app } = await import("../src/app");

const USER = {
  name: "Test User",
  email: "test@example.com",
  password: "correct-horse-battery",
};

const signUp = async () =>
  app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USER),
  });

const signIn = async () =>
  app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER.email, password: USER.password }),
  });

describe("auth api", () => {
  it("POST sign-up creates a user + credential account", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: USER.email } });
    expect(user).toBeTruthy();
    const account = await db.account.findFirst({
      where: { userId: user!.id, providerId: "credential" },
    });
    // The password lives on the account (the login method), never the user.
    expect(account?.password).toBeTruthy();
    expect(user!.name).toBe(USER.name);
  });

  it("duplicate sign-up is rejected", async () => {
    const res = await signUp();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("sign-up with a too-short password is rejected", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...USER, email: "short@test.dev", password: "short" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: "short@test.dev" } });
    expect(user).toBeNull();
  });

  it("sign-in returns a session; wrong password is rejected", async () => {
    const ok = await signIn();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("session_token=");

    const bad = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.email, password: "wrong" }),
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it("session token resolves to the user via get-session", async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    const token =
      (res.headers.get("set-cookie") ?? "").match(/session_token=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    const me = await app.request("/api/auth/get-session", {
      headers: { cookie: `better-auth.session_token=${token}` },
    });
    expect(me.status).toBe(200);
    const session = await me.json();
    expect(session?.user.email).toBe(USER.email);
  });

  it("no cookie → no session", async () => {
    const res = await app.request("/api/auth/get-session");
    const session = await res.json();
    expect(session).toBeFalsy();
  });

  const signInFrom = (origin: string) =>
    app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: USER.email, password: USER.password }),
    });

  it("sign-in from the web origin is accepted although the api host differs", async () => {
    const res = await signInFrom("http://localhost:3000");
    expect(res.status).toBe(200);
  });

  it("sign-in from a foreign origin is rejected", async () => {
    const res = await signInFrom("http://evil.example");
    expect(res.status).toBe(403);
  });

  // ── Time zone ─────────────────────────────────────────────────────────
  const signUpAs = (email: string, extra: Record<string, unknown>) =>
    app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...USER, email, ...extra }),
    });

  const cookieOf = (res: Response) =>
    `better-auth.session_token=${(res.headers.get("set-cookie") ?? "").match(/session_token=([^;]+)/)?.[1]}`;

  // A cookie-bearing write needs the web Origin, as a browser sends it:
  // Better Auth's CSRF check rejects it with 403 otherwise.
  const updateUser = (cookie: string, body: Record<string, unknown>) =>
    app.request("/api/auth/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, Origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });

  it("sign-up stores the time zone and get-session returns it", async () => {
    const res = await signUpAs("tz@test.dev", { timezone: "Asia/Kolkata" });
    expect(res.status).toBe(200);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: "tz@test.dev" } });
    expect(user?.timezone).toBe("Asia/Kolkata");

    const me = await app.request("/api/auth/get-session", {
      headers: { cookie: cookieOf(res) },
    });
    expect((await me.json())?.user.timezone).toBe("Asia/Kolkata");
  });

  it("sign-up without a time zone still works (stored as null)", async () => {
    expect((await signUpAs("notz@test.dev", {})).status).toBe(200);
    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: "notz@test.dev" } });
    expect(user?.timezone).toBeNull();
  });

  it("sign-up with an invalid time zone is rejected and creates no user", async () => {
    for (const [i, timezone] of ["Mars/Olympus", "+05:00", 42].entries()) {
      const email = `badtz${i}@test.dev`;
      const res = await signUpAs(email, { timezone });
      expect(res.status).toBe(400);
      const { db } = await import("../src/db");
      expect(await db.user.findUnique({ where: { email } })).toBeNull();
    }
  });

  it("update-user sets a valid time zone and rejects an invalid one", async () => {
    const res = await signUpAs("move@test.dev", {});
    const cookie = cookieOf(res);
    expect((await updateUser(cookie, { timezone: "Europe/London" })).status).toBe(200);
    expect((await updateUser(cookie, { timezone: "Nowhere/Land" })).status).toBe(400);

    const { db } = await import("../src/db");
    const user = await db.user.findUnique({ where: { email: "move@test.dev" } });
    expect(user?.timezone).toBe("Europe/London");
  });

  it("credential endpoints get the custom rate limits", async () => {
    // The limiter itself is off under test; this pins the config, because a
    // misnamed option key is silently ignored by Better Auth.
    const { auth } = await import("../src/lib/auth");
    expect(auth.options.rateLimit?.customRules).toEqual({
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
    });
  });

  // ── Forgot and change password ────────────────────────────────────────
  const WEB = "http://localhost:3000";
  const post = (path: string, body: Record<string, unknown>, cookie?: string) =>
    app.request(`/api/auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: WEB,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const sessionEmail = async (cookie: string) => {
    const res = await app.request("/api/auth/get-session", { headers: { cookie } });
    return ((await res.json()) as { user?: { email: string } } | null)?.user?.email ?? null;
  };
  const signInAs = (email: string, password: string) =>
    post("/sign-in/email", { email, password });
  const requestReset = (email: string) =>
    post("/request-password-reset", { email, redirectTo: `${WEB}/reset-password` });
  /** The user's reset tokens, newest first, read from the database (the email itself is not captured). */
  const resetTokenFor = async (email: string) => {
    const { db } = await import("../src/db");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const rows = await db.verification.findMany({
      where: { value: user.id, identifier: { startsWith: "reset-password:" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => r.identifier.slice("reset-password:".length));
  };

  it("a reset request answers the same for known and unknown emails", async () => {
    await signUpAs("forgot@test.dev", {});
    const known = await requestReset("forgot@test.dev");
    const unknown = await requestReset("nobody@test.dev");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(await resetTokenFor("forgot@test.dev")).toHaveLength(1);
  });

  it("a second reset request for the same user also works", async () => {
    const res = await requestReset("forgot@test.dev");
    expect(res.status).toBe(200);
    expect(await resetTokenFor("forgot@test.dev")).toHaveLength(2);
  });

  it("the emailed link redirects to the web reset page with the token", async () => {
    const [token] = await resetTokenFor("forgot@test.dev");
    const callback = encodeURIComponent(`${WEB}/reset-password`);
    const ok = await app.request(`/api/auth/reset-password/${token}?callbackURL=${callback}`);
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe(`${WEB}/reset-password?token=${token}`);

    const bad = await app.request(`/api/auth/reset-password/not-a-token?callbackURL=${callback}`);
    expect(bad.headers.get("location")).toBe(`${WEB}/reset-password?error=INVALID_TOKEN`);
  });

  it("a reset link may only send people back to a trusted origin", async () => {
    const res = await post("/request-password-reset", {
      email: "forgot@test.dev",
      redirectTo: "https://evil.example/steal",
    });
    expect(res.status).toBe(403);
  });

  it("resetting sets the new password, signs out every session, and spends the token", async () => {
    const before = cookieOf(await signInAs("forgot@test.dev", USER.password));
    expect(await sessionEmail(before)).toBe("forgot@test.dev");
    const [token] = await resetTokenFor("forgot@test.dev");

    expect((await post("/reset-password", { token, newPassword: "short" })).status).toBe(400);
    const res = await post("/reset-password", { token, newPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);

    expect(await sessionEmail(before)).toBeNull();
    expect((await signInAs("forgot@test.dev", USER.password)).status).toBe(401);
    expect((await signInAs("forgot@test.dev", "a-brand-new-password")).status).toBe(200);
    expect((await post("/reset-password", { token, newPassword: "another-password-1" })).status).toBe(400);
  });

  it("changing the password needs a session and the current password", async () => {
    const body = { currentPassword: USER.password, newPassword: "changed-password-1", revokeOtherSessions: true };
    expect((await post("/change-password", body)).status).toBe(401);

    await signUpAs("change@test.dev", {});
    const here = cookieOf(await signInAs("change@test.dev", USER.password));
    const wrong = await post("/change-password", { ...body, currentPassword: "not-my-password" }, here);
    expect(wrong.status).toBe(400);
    expect((await post("/change-password", { ...body, newPassword: "short" }, here)).status).toBe(400);
  });

  it("changing the password keeps this device signed in and signs out the others", async () => {
    const here = cookieOf(await signInAs("change@test.dev", USER.password));
    const elsewhere = cookieOf(await signInAs("change@test.dev", USER.password));
    const res = await post(
      "/change-password",
      { currentPassword: USER.password, newPassword: "changed-password-1", revokeOtherSessions: true },
      here,
    );
    expect(res.status).toBe(200);

    expect(await sessionEmail(cookieOf(res))).toBe("change@test.dev");
    expect(await sessionEmail(elsewhere)).toBeNull();
    expect((await signInAs("change@test.dev", "changed-password-1")).status).toBe(200);
  });
});
