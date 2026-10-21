"use client";

import { z } from "zod";
import { isValidTimeZone } from "@streakly/shared";

/**
 * Session client for the web app. Every call goes through the existing
 * same-origin /api proxy to the auth endpoints, so no CORS surface and
 * the session cookie flows with the default same-origin credentials.
 * Responses are zod-parsed: the app never renders a field the contract
 * did not send.
 */

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  timezone: z.string().nullish(),
});

const signInSchema = z.object({ user: userSchema }).passthrough();

const sessionSchema = z.object({ user: userSchema }).passthrough();

/** An auth request the server refused, with Better Auth's error code when it sent one. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Reads the API's error body into an AuthError, with a generic message for unknown shapes. */
async function authError(res: Response): Promise<AuthError> {
  try {
    const body = z
      .object({ message: z.string().optional(), code: z.string().optional() })
      .passthrough()
      .parse(await res.json());
    return new AuthError(
      body.message ?? `Server responded with ${res.status}`,
      body.code ?? null,
      res.status,
    );
  } catch {
    return new AuthError(`Server responded with ${res.status}`, null, res.status);
  }
}

/** Returns the API's error message, or a generic one for unknown shapes. */
async function errorMessage(res: Response): Promise<string> {
  return (await authError(res)).message;
}

/** Posts to an auth endpoint and returns the user, or throws the server's message. */
async function postAuth(
  path: string,
  body: Record<string, string | undefined>,
): Promise<z.infer<typeof userSchema>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return signInSchema.parse(await res.json()).user;
}

/**
 * Exchanges email + password for a session cookie. Returns the user;
 * rejects with the server's contract message on bad credentials.
 */
export function signIn(email: string, password: string) {
  return postAuth("/api/auth/sign-in/email", { email, password });
}

/**
 * Returns the browser's IANA time zone, or undefined when the runtime
 * reports none or one the server would reject.
 */
function browserTimeZone(): string | undefined {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : undefined;
}

/**
 * Creates the account and signs in (Better Auth signs up+in in one call).
 * The browser's time zone goes along, so the user's streaks count their
 * own days from the first check-in.
 */
export function signUp(email: string, password: string, name: string) {
  return postAuth("/api/auth/sign-up/email", {
    email,
    password,
    name,
    timezone: browserTimeZone(),
  });
}

/**
 * Stores the browser's time zone on the user when it differs from the one
 * on file: filled in for users who signed up before zones were stored, and
 * updated after travel. Check-ins keep the dates they were saved on, so
 * past streaks are not recalculated in the new zone.
 */
export async function syncTimeZone(user: z.infer<typeof userSchema>): Promise<void> {
  const timezone = browserTimeZone();
  if (!timezone || timezone === user.timezone) return;
  const res = await fetch("/api/auth/update-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

/**
 * Resolves the current session, or null when signed out. A network
 * failure surfaces as a rejection so the caller can distinguish
 * "signed out" from "cannot reach the server".
 */
export async function getSession() {
  const res = await fetch("/api/auth/get-session", { cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res));
  const body = await res.json();
  if (body === null) return null;
  return sessionSchema.parse(body).user;
}

/** Clears the session cookie. Rejects only on transport/contract errors. */
export async function signOut(): Promise<void> {
  const res = await fetch("/api/auth/sign-out", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

/** Posts JSON to an auth endpoint that answers with a status, throwing an AuthError on refusal. */
async function postStatus(path: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await authError(res);
}

/**
 * Asks the server to email a reset link. It answers the same whether or
 * not the email has an account, so success says nothing about the email.
 * The link lands on this site's /reset-password page.
 */
export function requestPasswordReset(email: string): Promise<void> {
  return postStatus("/api/auth/request-password-reset", {
    email,
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

/**
 * Sets a new password with the token from a reset link. The server signs
 * out every session, so the user signs in again afterwards. An expired or
 * used token rejects with code INVALID_TOKEN.
 */
export function resetPassword(token: string, newPassword: string): Promise<void> {
  return postStatus("/api/auth/reset-password", { token, newPassword });
}

/**
 * Changes the password of the signed-in user. Other devices are signed
 * out; this one stays signed in with a fresh session cookie. A wrong
 * current password rejects with code INVALID_PASSWORD.
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return postStatus("/api/auth/change-password", {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
}
