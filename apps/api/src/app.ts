import { Hono } from "hono";
import goalsRoute from "./routes/goals";
import { authRoute } from "./routes/auth";
import { handleError, requestLog, type RequestEnv } from "./lib/observability";

/**
 * The api's Hono app: routes, mount points, and error mapping. Kept out of
 * the entry file and exported by name, because Bun auto-starts a server
 * (on port 3000) for an entry file whose default export has a `fetch`
 * method, which then fights the web app for its port.
 */
export const app = new Hono<RequestEnv>()
  .basePath("/api")
  // First, so every response carries the id, including 404s and errors.
  .use("*", requestLog)
  .route("/goals", goalsRoute)
  .route("/auth", authRoute)
  .get("/health", (c) => c.json({ ok: true }))
  // An unknown path answers in the same JSON shape as every other error, so
  // a client never has to parse Hono's plain-text default.
  .notFound((c) => c.json({ error: "Not found." }, 404))
  // HttpErrors (400/413/415/429 from validation and lib) return their
  // message; anything unexpected is logged with its request id and returns a
  // generic 500 (see lib/observability.ts).
  .onError(handleError);
