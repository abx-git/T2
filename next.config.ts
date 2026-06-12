import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isStaticExport = process.env.T2_BUILD_TARGET === "static";

/** GitHub-Project-Pages: https://<user>.github.io/<repo>/ — per Env überschreibbar. */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? (isStaticExport ? "/T2" : "")).replace(/\/$/, "");

function buildRevision(): string {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  if (git.status === 0 && git.stdout?.trim()) return git.stdout.trim();
  return randomUUID();
}

const offlinePath = `${basePath}/~offline`.replace(/\/{2,}/g, "/") || "/~offline";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: offlinePath, revision: buildRevision() }],
  /** In Dev kein SW (Caching stört Hot-Reload). */
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        /** Minimales Node-Bundle unter `.next/standalone` zum Packen als ZIP/Deployment. */
        output: "standalone",
      }),
};

export default withSerwist(nextConfig);
