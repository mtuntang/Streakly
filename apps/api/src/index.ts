import { app } from "./app";

/** Entry point: serves the app. Tests import ./app and never bind a port. */
Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 4000),
});
