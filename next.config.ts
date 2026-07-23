import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // The admin launch console has a large server-only module graph. Keep the
    // development compiler from retaining every entry at startup and use the
    // lower-memory webpack representation recommended by Next.js.
    preloadEntriesOnStart: false,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
