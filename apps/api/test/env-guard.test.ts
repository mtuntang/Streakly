import { describe, expect, test } from "bun:test";
import { assertBootEnv } from "../src/lib/env-guard";

const SECRET = "at-least-32-bytes-of-entropy-goes-here";
const BASE_URL = "https://streakly.example";

function boot(env: Record<string, string>) {
  return () => assertBootEnv(env as NodeJS.ProcessEnv);
}

describe("assertBootEnv", () => {
  test("development without config boots (library dev default)", () => {
    expect(boot({ NODE_ENV: "development" })).not.toThrow();
  });

  test("production with a secret and a base url boots", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: BASE_URL,
      }),
    ).not.toThrow();
  });

  test("production without a secret refuses to boot, naming env and variable", () => {
    expect(boot({ NODE_ENV: "production", BETTER_AUTH_URL: BASE_URL })).toThrow(
      /production: BETTER_AUTH_SECRET is missing/,
    );
  });

  test("production with a short secret refuses to boot", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "too-short",
        BETTER_AUTH_URL: BASE_URL,
      }),
    ).toThrow(/BETTER_AUTH_SECRET is shorter than 32 characters/);
  });

  test("production without a base url refuses to boot", () => {
    expect(
      boot({ NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET }),
    ).toThrow(/BETTER_AUTH_URL is missing/);
  });

  test("unset NODE_ENV without config refuses to boot (unknown is not dev)", () => {
    expect(boot({})).toThrow(
      /unset: BETTER_AUTH_SECRET is missing; BETTER_AUTH_URL is missing/,
    );
  });
});
