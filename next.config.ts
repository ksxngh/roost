import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emit a self-contained server bundle (`.next/standalone`) that ships only
  // the files and dependencies actually used, for a lean production Docker
  // image. See the Dockerfile and docs/deployment.md.
  output: "standalone",
};

export default nextConfig;
