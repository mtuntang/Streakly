import { describe, expect, test } from "bun:test";
import { assertBootEnv } from "../src/lib/env-guard";

describe("assertBootEnv", () => {
  test("development without a secret boots (library dev default)", () => {
    expect(() =>
      assertBootEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  test("production without a secret refuses to boot, naming the variable", () => {
    try {
      assertBootEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
      throw new Error("expected assertBootEnv to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("BETTER_AUTH_SECRET");
      expect((err as Error).message).toContain("production");
    }
  });

  test("production with a secret boots", () => {
    expect(() =>
      assertBootEnv({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "at-least-32-bytes-of-entropy-goes-here",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  test("unset NODE_ENV without a secret refuses to boot (unknown is not dev)", () => {
    expect(() => assertBootEnv({} as NodeJS.ProcessEnv)).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});
