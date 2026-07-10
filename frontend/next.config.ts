import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next doesn't get confused by the
  // repo-root lockfile (backend + frontend both ship a package-lock.json).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
