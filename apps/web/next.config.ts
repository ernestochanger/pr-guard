import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appUrlHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  allowedDevOrigins: [
    "amaze-chokehold-chimp.ngrok-free.dev",
    ...(appUrlHost ? [appUrlHost] : [])
  ],
  transpilePackages: [
    "@pr-guard/shared",
    "@pr-guard/db",
    "@pr-guard/github",
    "@pr-guard/ai",
    "@pr-guard/analysis"
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  }
};

export default nextConfig;
