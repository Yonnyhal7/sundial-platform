import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const pwaDeploymentVersion = randomUUID();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION: pwaDeploymentVersion,
  },
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
  outputFileTracingIncludes: {
    "/api/admin/\\[school\\]/calendar/ai-import": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
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
