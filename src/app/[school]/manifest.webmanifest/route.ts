import { NextResponse } from "next/server";
import { getSchoolLifecycleBySubdomain } from "@/lib/schools";

type SchoolManifestRouteContext = {
  params: Promise<{ school: string }>;
};

export async function GET(_request: Request, { params }: SchoolManifestRouteContext) {
  const { school } = await params;
  const lifecycle = await getSchoolLifecycleBySubdomain(school);
  if (!lifecycle) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }
  if (lifecycle.archived_at) {
    return NextResponse.json(
      { error: "This school is currently unavailable." },
      { status: 410, headers: { "Cache-Control": "no-store" } }
    );
  }
  const schoolRoot = `/${school}`;
  const appPath = `${schoolRoot}/app`;

  return NextResponse.json({
    id: appPath,
    name: "Sundial",
    short_name: "Sundial",
    description:
      "School schedules, announcements, events, and communication in one place.",
    start_url: appPath,
    scope: `${schoolRoot}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#D4A017",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  });
}
