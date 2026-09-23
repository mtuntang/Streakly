import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_PROXY_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
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