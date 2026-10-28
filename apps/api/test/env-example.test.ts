/**
 * Keeps .env.example in step with the api's boot guard.
 *
 * The guard refuses to start in production without certain variables. If a
 * new one is added there and nobody updates the template, a deploy finds out
 * by crashing instead of by reading the file. This test reads both.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../..");
const EXAMPLE = readFileSync(path.join(ROOT, ".env.example"), "utf8");
const GUARD = readFileSync(
  path.join(ROOT, "apps/api/src/lib/env-guard.ts"),
  "utf8",
);

/** Every process.env.X the guard pushes a problem about. */
const required = [...GUARD.matchAll(/!env\.([A-Z][A-Z0-9_]*)\)/g)].map(
  (match) => match[1]!,
);

/** Variables the api reads but does not refuse to boot without. */
const optional = [...GUARD.matchAll(/env\.([A-Z][A-Z0-9_]*)\s*(\?:|\|\||&&|$)/g)]
  .map((match) => match[1]!)
  .filter((name) => !required.includes(name));

describe(".env.example", () => {
  test("the guard still requires something", () => {
    // A guard that requires nothing would make the rest of this file vacuous.
    expect(required.length).toBeGreaterThanOrEqual(4);
  });

  test("documents every variable the boot guard requires", () => {
    const missing = required.filter((name) => !EXAMPLE.includes(name));
    expect(missing).toEqual([]);
  });

  test("documents the optional variables the api reads", () => {
    const missing = optional.filter((name) => !EXAMPLE.includes(name));
    expect(missing).toEqual([]);
  });

  test("holds no real-looking secrets", () => {
    // A committed template must never carry a live key or a filled secret.
    expect(EXAMPLE).not.toMatch(/re_[A-Za-z0-9]{16,}/);
    expect(EXAMPLE).not.toMatch(/^BETTER_AUTH_SECRET=.+/m);
  });

  test("keeps its dev database URL pointed at localhost", () => {
    expect(EXAMPLE).toMatch(/^DATABASE_URL=postgresql:\/\/[^\s]*localhost:5432/m);
  });
});
