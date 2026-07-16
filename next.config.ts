import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/admin/[school]/calendar/ai-import": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-*/**/*",
      "./node_modules/pdf-parse/node_modules/@napi-rs/canvas/**/*",
      "./node_modules/pdf-parse/node_modules/@napi-rs/canvas-linux-*/**/*",
      "./node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/**/*",
      "./node_modules/pdfjs-dist/node_modules/@napi-rs/canvas-linux-*/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
