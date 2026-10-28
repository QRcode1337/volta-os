import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  // Next 16 writes an AGENTS.md into the project root on every `next dev`; this repo keeps its agent docs in workspace/.
  agentRules: false,
  // Lets a verification build run beside the dev server: NEXT_DIST_DIR=.next-verify next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // ~/package-lock.json exists higher up; pin tracing to this project.
  outputFileTracingRoot: path.join(__dirname),
  // Dev assets/HMR must be allowed for the Tailscale hostname (tailscale serve → 127.0.0.1:50000).
  allowedDevOrigins: process.env.VOLTA_TAILNET_HOST ? [process.env.VOLTA_TAILNET_HOST] : [],
};

export default nextConfig;
