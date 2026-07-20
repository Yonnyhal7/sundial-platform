import "server-only";
import { NextResponse } from "next/server";
import { getMobileAppSchool } from "@/lib/mobileAppData";
import { getForwardedHost } from "@/lib/routing/hosts";
import { getSchoolAppBasePath } from "@/lib/routing/paths";
import { isSchoolFeatureAvailable } from "@/lib/schoolFeatures.server";
import { getSchoolLifecycleBySubdomain } from "@/lib/schools";
import { buildSchoolAppManifest } from "./schoolAppManifest";

const MANIFEST_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Content-Type": "application/manifest+json; charset=utf-8",
  Vary: "Host, X-Forwarded-Host, X-Sundial-Forwarded-Host",
};

export async function getSchoolAppManifestResponse(
  request: Request,
  school: string
) {
  const normalizedSchool = school.trim().toLowerCase();
  const lifecycle = await getSchoolLifecycleBySubdomain(normalizedSchool);

  if (!lifecycle) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  if (lifecycle.archived_at) {
    return NextResponse.json(
      { error: "This school is currently unavailable." },
      { status: 410, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!(await isSchoolFeatureAvailable(lifecycle.id, "pwa"))) {
    return NextResponse.json({ error: "PWA is not enabled." }, { status: 404 });
  }

  const schoolData = await getMobileAppSchool(normalizedSchool);

  if (
    !schoolData ||
    schoolData.id !== lifecycle.id ||
    schoolData.subdomain.trim().toLowerCase() !== normalizedSchool
  ) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const visiblePathname =
    request.headers.get("x-sundial-pathname") || new URL(request.url).pathname;
  const hostname = getForwardedHost(request.headers);
  const appPath = getSchoolAppBasePath(
    normalizedSchool,
    visiblePathname,
    hostname
  );
  const manifest = buildSchoolAppManifest(schoolData, appPath);

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: MANIFEST_HEADERS,
  });
}
