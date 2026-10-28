import path from "node:path";
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_PROXY_URL ?? "http://localhost:4000";

// The monorepo root. The standalone build traces files from here, so it can
// bundle the workspace packages (packages/shared) this app imports.
const REPO_ROOT = path.join(__dirname, "../..");

/**
 * The Content-Security-Policy for one build. Dev needs 'unsafe-eval' because
 * next dev compiles modules with eval-based source maps; production never
 * does. Everything else is the same in both.
 */
export const cspFor = (production: boolean): string =>
  [
    "default-src 'self'",
    production
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // No upgrade-insecure-requests: it rewrites every subresource to https,
    // which breaks any http origin (local production runs included) by
    // silently failing to load the JS and CSS. HSTS already upgrades the
    // first http request on a real deploy and keeps it https afterwards.
  ].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: REPO_ROOT,
  turbopack: { root: REPO_ROOT },
  typescript: {
    // Ensure TypeScript errors are caught during builds
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Security headers on every response. The app loads nothing from other
  // origins (no CDN, no web fonts, no third-party images), so the policy
  // can stay tight. 'unsafe-inline' is required for scripts and styles
  // because Next injects the RSC payload and the theme bootstrap inline;
  // frame-ancestors 'none' plus X-Frame-Options is what stops clickjacking.
  async headers() {
    const csp = cspFor(process.env.NODE_ENV === "production");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // The web app owns no data: all /api/* requests are proxied to
  // @streakly/api (apps/api), the sole database owner.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;