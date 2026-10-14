"use client";

import { z } from "zod";

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
});

const signInSchema = z.object({ user: userSchema }).passthrough();

const sessionSchema = z.object({ user: userSchema }).passthrough();

/** Returns the API's error message, or a generic one for unknown shapes. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = z
      .object({ message: z.string().optional() })
      .passthrough()
      .parse(await res.json());
    return body.message ?? `Server responded with ${res.status}`;
  } catch {
    return `Server responded with ${res.status}`;
  }
}

/** Posts to an auth endpoint and returns the user, or throws the server's message. */
async function postAuth(
  path: string,
  body: Record<string, string>,
): Promise<{ id: string; email: string; name: string }> {
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

/** Creates the account and signs in (Better Auth signs up+in in one call). */
export function signUp(email: string, password: string, name: string) {
  return postAuth("/api/auth/sign-up/email", { email, password, name });
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
