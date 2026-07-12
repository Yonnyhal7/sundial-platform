import { NextResponse } from "next/server";
import { fetchSchoolOfflineSnapshot } from "@/lib/offline/fetchSchoolSnapshot.server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ school: string }> }
) {
  const { school } = await params;

  try {
    const snapshot = await fetchSchoolOfflineSnapshot(school);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.warn("[offline] snapshot fetch failed", {
      school,
      error,
    });

    return NextResponse.json(
      { error: "Unable to refresh offline school data." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
