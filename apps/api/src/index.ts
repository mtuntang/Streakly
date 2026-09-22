import { Hono } from "hono";
import goalsRoute from "./routes/goals";

const app = new Hono()
  .basePath("/api")
  .route("/goals", goalsRoute)
  .get("/health", (c) => c.json({ ok: true }));

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
