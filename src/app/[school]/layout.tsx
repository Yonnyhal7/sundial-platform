import { headers } from "next/headers";
import SchoolPublicNav from "@/components/SchoolPublicNav";
import { getForwardedHost, parseSundialHost } from "@/lib/routing/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeAppearancePreference,
  type AppearancePreference,
} from "@/lib/themeScope";
import { getSchoolLifecycleBySubdomain } from "@/lib/schools";
import PublicFooterRoute from "@/components/public-site/PublicFooterRoute";
import { requirePublicSchool } from "@/lib/publicSite";
import { getContrastTextColor } from "@/lib/schoolTheme";
import type { CSSProperties } from "react";

async function getSchoolDefaultAppearance(
  school: string
): Promise<AppearancePreference> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
    .rpc("get_available_school_by_subdomain", {
        subdomain_input: school,
      })
      .maybeSingle<{ default_appearance: AppearancePreference | null }>();

    return normalizeAppearancePreference(data?.default_appearance);
  } catch {
    return "system";
  }
}

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const lifecycle = await getSchoolLifecycleBySubdomain(school);
  if (lifecycle?.archived_at) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-slate-950 dark:bg-black dark:text-white">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-2xl font-bold">This school is currently unavailable</h1>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Please contact your school if you believe this is an error.</p>
        </div>
      </main>
    );
  }
  const headerStore = await headers();
  const parsedHost = parseSundialHost(getForwardedHost(headerStore));
  const showPublicNav = parsedHost.kind !== "admin";
  const schoolDefaultAppearance = showPublicNav
    ? await getSchoolDefaultAppearance(school)
    : "system";
  const publicSchool = showPublicNav ? (await requirePublicSchool(school)).school : null;

  return (
    <div
      className="school-public-theme min-h-screen bg-[#f7f7f5] text-slate-950 dark:bg-[#101214] dark:text-white"
      style={publicSchool ? ({
        "--school-primary": publicSchool.primary_color || "#2563eb",
        "--school-secondary": publicSchool.secondary_color || publicSchool.primary_color || "#64748b",
        "--school-primary-text": getContrastTextColor(publicSchool.primary_color || "#2563eb"),
      } as CSSProperties) : undefined}
    >
      {showPublicNav && (
        <SchoolPublicNav
          school={school}
          base={parsedHost.kind === "school" ? "" : `/${school}`}
          schoolName={publicSchool!.name}
          logoUrl={publicSchool!.logo_url}
          schoolDefaultAppearance={schoolDefaultAppearance}
        />
      )}
      {children}
      {showPublicNav && publicSchool && <PublicFooterRoute school={publicSchool} base={parsedHost.kind === "school" ? "" : `/${school}`} />}
    </div>
  );
}
