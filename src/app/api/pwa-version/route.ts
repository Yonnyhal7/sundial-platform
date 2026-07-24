import { NextResponse } from "next/server";
import { getPwaDeploymentVersion } from "@/lib/pwa/deploymentVersion";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: getPwaDeploymentVersion() },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
