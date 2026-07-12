import { headers } from "next/headers";
import SchoolPublicNav from "@/components/SchoolPublicNav";
import { getForwardedHost, parseSundialHost } from "@/lib/routing/hosts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeAppearancePreference,
  type AppearancePreference,
} from "@/lib/themeScope";

async function getSchoolDefaultAppearance(
  school: string
): Promise<AppearancePreference> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .rpc("get_school_by_subdomain", {
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
  const headerStore = await headers();
  const parsedHost = parseSundialHost(getForwardedHost(headerStore));
  const showPublicNav = parsedHost.kind !== "admin";
  const schoolDefaultAppearance = showPublicNav
    ? await getSchoolDefaultAppearance(school)
    : "system";

  return (
    <div className="school-public-theme min-h-screen bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      {showPublicNav && (
        <SchoolPublicNav
          school={school}
          schoolDefaultAppearance={schoolDefaultAppearance}
        />
      )}
      {children}
    </div>
  );
}
