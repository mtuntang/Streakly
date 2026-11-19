/**
 * The drain-on-SIGTERM path, driven with fakes: no real server, no real pool,
 * no real process exit. What matters is that a deploy's SIGTERM closes the
 * listener and the pool exactly once and reports a clean stop, so the
 * platform does not record a crash mid-response.
 */
import { describe, expect, it } from "bun:test";
import { createShutdown } from "../src/lib/shutdown";

function harness(overrides: { stop?: () => Promise<void>; closeDb?: () => Promise<void> } = {}) {
  const calls = { stop: 0, closeDb: 0, exit: [] as number[], logs: [] as string[] };
  const shutdown = createShutdown({
    server: {
      stop: async () => {
        calls.stop += 1;
        if (overrides.stop) await overrides.stop();
      },
    },
    closeDb: async () => {
      calls.closeDb += 1;
      if (overrides.closeDb) await overrides.closeDb();
    },
    log: (message) => calls.logs.push(message),
    exit: (code) => calls.exit.push(code),
  });
  return { shutdown, calls };
}

describe("createShutdown", () => {
  it("stops the listener, closes the pool and exits 0", async () => {
    const { shutdown, calls } = harness();
    await shutdown("SIGTERM");
    expect(calls.stop).toBe(1);
    expect(calls.closeDb).toBe(1);
    expect(calls.exit).toEqual([0]);
    expect(calls.logs.some((line) => line.includes("SIGTERM"))).toBe(true);
  });

  it("drains only once, so a second signal cannot restart a half-finished drain", async () => {
    const { shutdown, calls } = harness();
    await shutdown("SIGTERM");
    await shutdown("SIGINT");
    expect(calls.stop).toBe(1);
    expect(calls.closeDb).toBe(1);
    expect(calls.exit).toEqual([0]);
  });

  it("exits 1 when the pool refuses to close, so the platform sees a bad stop", async () => {
    const { shutdown, calls } = harness({
      closeDb: async () => {
        throw new Error("pool is wedged");
      },
    });
    await shutdown("SIGTERM");
    expect(calls.exit).toEqual([1]);
    expect(calls.logs.some((line) => line.includes("pool is wedged"))).toBe(true);
  });

  it("gives up after the timeout instead of hanging the deploy forever", async () => {
    let exited: number[] = [];
    const shutdown = createShutdown({
      server: { stop: async () => {} },
      closeDb: () => new Promise<void>(() => {}), // never settles
      log: () => {},
      exit: (code) => exited.push(code),
      timeoutMs: 20,
    });
    void shutdown("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(exited).toEqual([1]);
    exited = [];
  });
});
