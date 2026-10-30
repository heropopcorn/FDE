import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["redis", "@huggingface/transformers", "onnxruntime-node"],
  turbopack: {
    rules: {
      // Only the Tailwind entry needs this loader; preserve CSS Module scoping.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
