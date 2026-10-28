import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import goalsRoute from "./routes/goals";
import { authRoute } from "./routes/auth";
import { HttpError, payloadTooLarge } from "./lib/http";

/** Largest request body the api reads. Real goal and auth bodies are under 2 KiB. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The api's Hono app: routes, mount points, and error mapping. Kept out of
 * the entry file and exported by name, because Bun auto-starts a server
 * (on port 3000) for an entry file whose default export has a `fetch`
 * method, which then fights the web app for its port.
 */
export const app = new Hono()
  .basePath("/api")
  // Bun.serve would otherwise buffer up to 128 MiB before any route or
  // validation runs.
  .use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw payloadTooLarge();
      },
    }),
  )
  .route("/goals", goalsRoute)
  .route("/auth", authRoute)
  .get("/health", (c) => c.json({ ok: true }))
  // HttpErrors (400/404 from validation and lib) return their message;
  // anything unexpected is logged here and returns a generic 500.
  .onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("Unhandled API error:", err);
    return c.json({ error: "Internal server error." }, 500);
  });
