/**
 * Draining shutdown for the api.
 *
 * A platform deploy sends SIGTERM and then kills the process a few seconds
 * later. Without a handler the api dies mid-response: in-flight requests are
 * cut, the response never finishes, and the client sees a 502 for a request
 * that may already have written to the database. This stops accepting new
 * connections, lets the open ones finish, closes the connection pool, and
 * exits 0 so the platform records a clean stop.
 *
 * Kept dependency-injected and free of process.exit so a test can drive it.
 */

/** The bits of Bun's Server this needs. */
export type StoppableServer = {
  stop(closeActiveConnections?: boolean): void | Promise<void>;
};

export type ShutdownDeps = {
  server: StoppableServer;
  /** Closes the database pool (db.$disconnect). */
  closeDb: () => Promise<void>;
  log?: (message: string) => void;
  /** Defaults to process.exit; injected by tests. */
  exit?: (code: number) => void;
  /** How long to wait for a stuck pool before giving up. */
  timeoutMs?: number;
};

/**
 * Returns the signal handler. Calling it twice (SIGTERM then SIGINT from an
 * impatient supervisor) does nothing the second time, so the drain cannot be
 * restarted halfway through.
 */
export function createShutdown({
  server,
  closeDb,
  log = (message) => console.log(message),
  exit = (code) => process.exit(code),
  timeoutMs = 10_000,
}: ShutdownDeps): (signal: string) => Promise<void> {
  let closing = false;

  return async (signal: string) => {
    if (closing) return;
    closing = true;
    log(`api: ${signal} received, draining`);

    const timer = setTimeout(() => {
      log("api: drain timed out, exiting");
      exit(1);
    }, timeoutMs);

    try {
      // No argument: Bun waits for in-flight requests before closing.
      await server.stop();
      await closeDb();
      log("api: closed cleanly");
      clearTimeout(timer);
      exit(0);
    } catch (err) {
      clearTimeout(timer);
      log(`api: shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
      exit(1);
    }
  };
}
