import { NextResponse } from "next/server";
import { fetchSchoolOfflineSnapshot } from "@/lib/offline/fetchSchoolSnapshot.server";
import { getSchoolLifecycleBySubdomain } from "@/lib/schools";
import { isSchoolFeatureAvailable } from "@/lib/schoolFeatures.server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ school: string }> }
) {
  const { school } = await params;
  const lifecycle = await getSchoolLifecycleBySubdomain(school);
  if (!lifecycle) {
    return NextResponse.json(
      { error: "School not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (lifecycle.archived_at) {
    return NextResponse.json(
      { error: "This school is currently unavailable." },
      { status: 410, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!await isSchoolFeatureAvailable(lifecycle.id,"offline_mode")) return NextResponse.json({error:"Offline mode is not enabled."},{status:404,headers:{"Cache-Control":"no-store"}});

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
