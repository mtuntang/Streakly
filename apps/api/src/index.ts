import { Hono } from "hono";
import goalsRoute from "./routes/goals";
import { HttpError } from "./lib/http";

const app = new Hono()
  .basePath("/api")
  .route("/goals", goalsRoute)
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

const port = Number(process.env.PORT ?? 4000);

// Only start listening when run directly (not when imported by tests).
if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port,
  });
  console.log(`@streakly/api listening on http://localhost:${port}`);
}

export default app;