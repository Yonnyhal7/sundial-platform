import { notFound, redirect } from "next/navigation";
import {
  getSchoolAdminPath,
  requireAdminPortalAccess,
} from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSchoolForSetup, isSchoolSetupComplete } from "@/lib/schools";
import { normalizeSetupStep, type SetupStepSlug } from "@/lib/setupSteps";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

type PendingSetupUser = {
  id: string;
  email: string;
  role: "school_admin" | "editor";
  permissionKeys: string[];
};

export async function getSetupContext(school: string) {
  const supabase = await createSupabaseServerClient();
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  const adminUser = await requireAdminPortalAccess(schoolData.id, school);
  const canSetup =
    isSuperAdminRole(adminUser.profile.role) ||
    isSchoolAdminRole(adminUser.profile.role);

  if (!canSetup) {
    redirect(await getSchoolAdminPath(school));
  }

  if (await isSchoolSetupComplete(supabase, schoolData.id)) {
    redirect(await getSchoolAdminPath(school));
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: district } = schoolData.district_id
    ? await serviceSupabase
        .from("districts")
        .select("name")
        .eq("id", schoolData.district_id)
        .maybeSingle<{ name: string }>()
    : { data: null };
  const { data: logoData } = await serviceSupabase
    .from("schools")
    .select("logo_url")
    .eq("id", schoolData.id)
    .maybeSingle<{ logo_url: string | null }>();
  const { data: pendingUsers } = await serviceSupabase
    .from("pending_admin_invites")
    .select("id, email, role, permission_keys")
    .eq("school_id", schoolData.id)
    .in("role", ["school_admin", "editor"])
    .returns<
      Array<{
        id: string;
        email: string;
        role: "school_admin" | "editor" | null;
        permission_keys: string[] | null;
      }>
    >();

  return {
    supabase,
    school,
    schoolData,
    district,
    logoUrl: logoData?.logo_url || null,
    pendingSetupUsers: ((pendingUsers || [])
      .filter((user) => user.role === "school_admin" || user.role === "editor")
      .map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role === "school_admin" ? "school_admin" : "editor",
        permissionKeys: user.permission_keys || [],
      })) || []) satisfies PendingSetupUser[],
    savedStep: normalizeSetupStep(schoolData.setup_step),
  };
}

export type SetupContext = Awaited<ReturnType<typeof getSetupContext>>;

export function getSetupFormValues(context: SetupContext, currentStep: SetupStepSlug) {
  return {
    school: context.school,
    currentStep,
  };
}
