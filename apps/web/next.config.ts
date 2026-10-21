import path from "node:path";
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_PROXY_URL ?? "http://localhost:4000";

// The monorepo root. The standalone build traces files from here, so it can
// bundle the workspace packages (packages/shared) this app imports.
const REPO_ROOT = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: REPO_ROOT,
  turbopack: { root: REPO_ROOT },
  typescript: {
    // Ensure TypeScript errors are caught during builds
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
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