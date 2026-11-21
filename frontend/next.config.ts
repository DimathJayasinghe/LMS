import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Next 16.3 defaults to the CLI type-check runner, whose captured
    // `tsc --showConfig` output is truncated in this build environment.
    // The compiler API performs the same strict check without that runner bug.
    useTypeScriptCli: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
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
