import { notFound, redirect } from "next/navigation";
import {
  getSchoolAdminPath,
  requireAdminPortalAccess,
} from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSchoolForSetup, isSchoolSetupComplete } from "@/lib/schools";
import { normalizeSetupStep, type SetupStepSlug } from "@/lib/setupSteps";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

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

  const { data: district } = schoolData.district_id
    ? await supabase
        .from("districts")
        .select("name")
        .eq("id", schoolData.district_id)
        .maybeSingle<{ name: string }>()
    : { data: null };

  return {
    supabase,
    school,
    schoolData,
    district,
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
