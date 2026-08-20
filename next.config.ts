import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Ensure TypeScript errors are caught during builds
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;