import { getSchoolAppManifestResponse } from "@/lib/pwa/schoolAppManifest.server";

type SchoolAppManifestRouteContext = {
  params: Promise<{ school: string }>;
};

export async function GET(
  request: Request,
  { params }: SchoolAppManifestRouteContext
) {
  const { school } = await params;
  return getSchoolAppManifestResponse(request, school);
}
