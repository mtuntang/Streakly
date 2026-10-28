import { describe, expect, test } from "bun:test";
import nextConfig, { cspFor } from "../../next.config";

/**
 * The headers next.config.ts puts on every response. Clickjacking and
 * content sniffing are whole-app risks, so a regression here should fail
 * a test rather than wait for someone to notice a missing header in prod.
 */
const headerMap = async (): Promise<Map<string, string>> => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((rule) => rule.source === "/:path*");
  expect(all).toBeDefined();
  return new Map((all?.headers ?? []).map((h) => [h.key, h.value]));
};

describe("security headers", () => {
  test("every route gets the framing, sniffing and referrer headers", async () => {
    const headers = await headerMap();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  test("HSTS is long-lived and covers subdomains", async () => {
    const value = (await headerMap()).get("Strict-Transport-Security") ?? "";
    expect(value).toContain("max-age=63072000");
    expect(value).toContain("includeSubDomains");
  });

  test("production never allows eval", () => {
    expect(cspFor(true)).not.toContain("'unsafe-eval'");
    // Dev needs it: next dev compiles with eval-based source maps.
    expect(cspFor(false)).toContain("'unsafe-eval'");
  });

  test("the CSP blocks framing, plugins and foreign script origins", async () => {
    const csp = cspFor(true);
    const directives = new Map(
      csp.split(";").map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name!, values.join(" ")] as const;
      }),
    );
    expect(directives.get("frame-ancestors")).toBe("'none'");
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'self'");
    expect(directives.get("form-action")).toBe("'self'");
    expect(directives.get("connect-src")).toBe("'self'");
    // No directive may allow a wildcard or a bare remote origin.
    expect(csp).not.toContain("*");
    expect(csp).not.toMatch(/https?:\/\//);
  });
});
