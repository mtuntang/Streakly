"use client";

/**
 * Fetches from the app's data endpoints, treating a 401 as an expired
 * session: it sends the browser to /sign-in instead of handing the caller
 * an error to show. The returned promise never settles in that case, so no
 * "could not load" toast or retry loop runs while the page navigates away.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    window.location.href = "/sign-in";
    return new Promise<never>(() => {});
  }
  return res;
}
