"use server";

import { redirect } from "next/navigation";
import {
  getSchoolAdminPath,
  getSchoolSetupStepPath,
  requireAdminPortalAccess,
} from "@/lib/auth/adminPermissions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import {
  generateSchoolSubdomainBase,
  getSchoolForSetup,
  updateSchoolSetupComplete,
  updateSchoolSetupStep,
} from "@/lib/schools";
import {
  getNextSetupStep,
  normalizeSetupStep,
  type SetupStepSlug,
} from "@/lib/setupSteps";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanColor(value: FormDataEntryValue | null, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

async function getOrCreateDistrictId(name: string) {
  if (!name) return null;

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: existingDistrict } = await serviceSupabase
    .from("districts")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingDistrict?.id) {
    return existingDistrict.id;
  }

  const { data: district, error } = await serviceSupabase
    .from("districts")
    .insert({
      name,
      slug: generateSchoolSubdomainBase(name),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("District setup error:", JSON.stringify(error, null, 2));
    return null;
  }

  return district.id;
}

async function requireSetupAccess(school: string) {
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    redirect("/admin/dashboard");
  }

  const adminUser = await requireAdminPortalAccess(schoolData.id, school);

  if (
    !isSuperAdminRole(adminUser.profile.role) &&
    !isSchoolAdminRole(adminUser.profile.role)
  ) {
    redirect(await getSchoolAdminPath(school));
  }

  return {
    schoolData,
    serviceSupabase: createSupabaseServiceRoleClient(),
  };
}

async function saveStepData(
  school: string,
  currentStep: SetupStepSlug,
  formData: FormData
) {
  const { schoolData, serviceSupabase } = await requireSetupAccess(school);

  if (currentStep === "school-profile") {
    const schoolName = cleanText(formData.get("schoolName"));
    const districtName = cleanText(formData.get("districtName"));
    const mascot = cleanText(formData.get("mascot"));
    const districtId = await getOrCreateDistrictId(districtName);

    const schoolPayload = {
      ...(schoolName ? { name: schoolName } : {}),
      mascot,
      ...(districtId ? { district_id: districtId } : {}),
    };

    const { error } = await serviceSupabase
      .from("schools")
      .update(schoolPayload)
      .eq("id", schoolData.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (currentStep === "branding") {
    const primaryColor = cleanColor(
      formData.get("primaryColor"),
      schoolData.primary_color || "#2563eb"
    );
    const secondaryColor = cleanColor(
      formData.get("secondaryColor"),
      schoolData.secondary_color || "#64748b"
    );

    const { error } = await serviceSupabase
      .from("schools")
      .update({
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
      .eq("id", schoolData.id);

    if (error) {
      throw new Error(error.message);
    }

    // TODO: Persist website theme and default appearance after theme settings exist.
  }

  if (currentStep === "administrators") {
    // TODO: Create pending admin/editor invites from the Admin Users step.
  }

  if (currentStep === "schedule") {
    // TODO: Generate calendar_days across the school year from the schedule pattern.
  }

  return { schoolData, serviceSupabase };
}

export async function continueSetupStepAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const currentStep = normalizeSetupStep(cleanText(formData.get("currentStep")));
  const requestedNextStep = normalizeSetupStep(cleanText(formData.get("nextStep")));
  const nextStep =
    requestedNextStep === currentStep ? getNextSetupStep(currentStep) : requestedNextStep;
  const { schoolData, serviceSupabase } = await saveStepData(
    school,
    currentStep,
    formData
  );

  await updateSchoolSetupStep(serviceSupabase, schoolData.id, nextStep);
  redirect(await getSchoolSetupStepPath(school, nextStep));
}

export async function finishSchoolSetupAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const currentStep = normalizeSetupStep(cleanText(formData.get("currentStep")));
  const { schoolData, serviceSupabase } = await saveStepData(
    school,
    currentStep,
    formData
  );

  await updateSchoolSetupStep(serviceSupabase, schoolData.id, "complete");
  await updateSchoolSetupComplete(serviceSupabase, schoolData.id, true);
  redirect(await getSchoolAdminPath(school));
}

export async function saveSetupProgressAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const currentStep = normalizeSetupStep(cleanText(formData.get("currentStep")));
  const { schoolData, serviceSupabase } = await saveStepData(
    school,
    currentStep,
    formData
  );

  await updateSchoolSetupStep(serviceSupabase, schoolData.id, currentStep);
  redirect(await getSchoolAdminPath(school));
}
