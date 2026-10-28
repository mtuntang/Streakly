import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";

/** Shape set by requestLog and read by the error handler. */
export type RequestEnv = { Variables: { requestId: string } };

/**
 * Assigns every request an id, echoes it back in `x-request-id`, and writes
 * one line per request when the response is done.
 *
 * Without this an incident has no handle: the only other log line the api
 * writes is the unhandled-error one, so "it 500'd sometime yesterday" was
 * unanswerable. One line per request is enough to correlate a user report
 * with a timestamp, a route and a status; the body and headers are never
 * logged, so no email, cookie or password ends up in the platform's logs.
 */
export const requestLog: MiddlewareHandler<RequestEnv> = async (c, next) => {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", id);
  const started = performance.now();
  await next();
  c.res.headers.set("x-request-id", id);
  const ms = Math.round(performance.now() - started);
  // Method, path (never the query string: reset links carry tokens), status
  // and duration. Health checks are skipped so they don't bury real traffic.
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health") return;
  console.log(
    `${c.req.method} ${path} ${c.res.status} ${ms}ms id=${id}`,
  );
};

/**
 * Turns thrown errors into responses. HttpErrors keep their message and
 * status; anything else is logged with its request id and returned as a
 * generic 500, so an internal path or a Prisma error never reaches a client
 * while the id ties the log line to the user's screenshot.
 */
export const handleError: ErrorHandler<RequestEnv> = (
  err: Error,
  c: Context<RequestEnv>,
) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status);
  }
  const id = c.get("requestId") ?? "unknown";
  console.error(`Unhandled API error id=${id}:`, err);
  return c.json({ error: "Internal server error.", requestId: id }, 500);
};
