import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Minimales Node-Bundle unter `.next/standalone` zum Packen als ZIP/Deployment. */
  output: "standalone",
};

export default nextConfig;
