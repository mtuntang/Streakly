import { app } from "./app";
import { db } from "./db";
import { createShutdown } from "./lib/shutdown";

/**
 * Entry point: serves the app and wires draining shutdown. Tests import
 * ./app and never bind a port.
 */
const server = Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 4000),
});

const shutdown = createShutdown({ server, closeDb: () => db.$disconnect() });

// SIGTERM is what a deploy sends; SIGINT is Ctrl-C in development. Both
// drain instead of dropping in-flight requests.
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log(`api: listening on ${server.port}`);
