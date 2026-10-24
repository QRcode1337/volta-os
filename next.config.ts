import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
  // Lets a verification build run beside the dev server: NEXT_DIST_DIR=.next-verify next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // ~/package-lock.json exists higher up; pin tracing to this project.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
