import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { NAV_REDIRECTS } from "./src/lib/nav-redirects";
import pkg from "./package.json";

// Settings → Help → Version. Workers Builds sets WORKERS_CI_COMMIT_SHA; local builds show the package version only.
const commit = (process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "").slice(0, 7);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    NEXT_PUBLIC_APP_VERSION: commit ? `${pkg.version} (${commit})` : pkg.version,
  },
  async redirects() {
    return [...NAV_REDIRECTS];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
