import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next doesn't get confused by the
  // repo-root lockfile (backend + frontend both ship a package-lock.json).
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // @zoom/meetingsdk's UMD bundle statically references this private,
      // unpublished package as an optional AMD dep of a feature we don't use
      // (local-recording download). See vendor-stubs/zoom-download-manager.js.
      "@zoom/download-manager": "./vendor-stubs/zoom-download-manager.js",
    },
  },
};

export default nextConfig;
