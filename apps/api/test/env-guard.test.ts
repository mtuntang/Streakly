import { describe, expect, test } from "bun:test";
import { assertBootEnv } from "../src/lib/env-guard";

const SECRET = "at-least-32-bytes-of-entropy-goes-here";
const BASE_URL = "https://streakly.example";
const DEPLOY_ENV = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Streakly <hello@streakly.example>",
  CLIENT_IP_HEADER: "x-real-ip",
};

function boot(env: Record<string, string>) {
  return () => assertBootEnv(env as NodeJS.ProcessEnv);
}

describe("assertBootEnv", () => {
  test("development without config boots (library dev default)", () => {
    expect(boot({ NODE_ENV: "development" })).not.toThrow();
  });

  test("production with a secret, a base url and email settings boots", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: BASE_URL,
        ...DEPLOY_ENV,
      }),
    ).not.toThrow();
  });

  test("production without a secret refuses to boot, naming env and variable", () => {
    expect(boot({ NODE_ENV: "production", BETTER_AUTH_URL: BASE_URL, ...DEPLOY_ENV })).toThrow(
      /production: BETTER_AUTH_SECRET is missing/,
    );
  });

  test("production with a short secret refuses to boot", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "too-short",
        BETTER_AUTH_URL: BASE_URL,
        ...DEPLOY_ENV,
      }),
    ).toThrow(/BETTER_AUTH_SECRET is shorter than 32 characters/);
  });

  test("production without a base url refuses to boot", () => {
    expect(
      boot({ NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET, ...DEPLOY_ENV }),
    ).toThrow(/BETTER_AUTH_URL is missing/);
  });

  test("production without email settings refuses to boot", () => {
    expect(
      boot({ NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: BASE_URL }),
    ).toThrow(/RESEND_API_KEY is missing; EMAIL_FROM is missing/);
  });

  test("production without a client IP header refuses to boot", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: BASE_URL,
        RESEND_API_KEY: DEPLOY_ENV.RESEND_API_KEY,
        EMAIL_FROM: DEPLOY_ENV.EMAIL_FROM,
      }),
    ).toThrow(/CLIENT_IP_HEADER is missing/);
  });

  test("production with CLIENT_IP_HEADER=none boots (no edge proxy, one shared bucket)", () => {
    expect(
      boot({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: BASE_URL,
        ...DEPLOY_ENV,
        CLIENT_IP_HEADER: "none",
      }),
    ).not.toThrow();
  });

  test("unset NODE_ENV without config refuses to boot (unknown is not dev)", () => {
    expect(boot({})).toThrow(
      /unset: BETTER_AUTH_SECRET is missing; BETTER_AUTH_URL is missing/,
    );
  });
});
