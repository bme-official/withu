import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
  async rewrites() {
    return [
      // Accept embedding via <script src=".../widget.js">
      { source: "/widget.js", destination: "/widget" },
    ];
  },
};

export default nextConfig;
