"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_ADMIN_PERMISSIONS } from "@/lib/adminDefaultPermissions";
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

type SetupInviteRole = "school_admin" | "editor";

type SubmittedSetupUser = {
  email: string;
  role: SetupInviteRole;
  permissionKeys: string[];
};

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanColor(value: FormDataEntryValue | null, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanMultilineText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function nullable(value: string) {
  return value || null;
}

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function getLogoExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "png" || extension === "webp" || extension === "svg") {
    return extension;
  }

  return file.type === "image/svg+xml" ? "svg" : "png";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createInviteToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function parseSetupUsers(value: FormDataEntryValue | null): SubmittedSetupUser[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const validPermissionKeys = new Set<string>(
    DEFAULT_ADMIN_PERMISSIONS.map((permission) => permission.key)
  );
  const seenEmails = new Set<string>();
  const users: SubmittedSetupUser[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const email = String(record.email || "").trim().toLowerCase();
    const role = record.role === "school_admin" ? "school_admin" : "editor";
    const permissionKeys =
      role === "school_admin"
        ? Array.from(validPermissionKeys)
        : Array.isArray(record.permissionKeys)
          ? record.permissionKeys
              .map((permissionKey) => String(permissionKey))
              .filter((permissionKey) => validPermissionKeys.has(permissionKey))
          : [];

    if (!isValidEmail(email) || seenEmails.has(email)) continue;

    users.push({ email, role, permissionKeys });
    seenEmails.add(email);
  }

  return users;
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
      logo_url: nullable(cleanMultilineText(formData.get("logoUrl"))),
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

  if (currentStep === "appearance") {
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
  }

  if (currentStep === "administrators") {
    const setupUsers = parseSetupUsers(formData.get("setupUsers"));

    const { error: deleteError } = await serviceSupabase
      .from("pending_admin_invites")
      .delete()
      .eq("school_id", schoolData.id)
      .in("role", ["school_admin", "editor"]);

    if (deleteError) {
      console.error("Delete setup invites error:", JSON.stringify(deleteError, null, 2));
      return { schoolData, serviceSupabase };
    }

    if (setupUsers.length > 0) {
      const { error } = await serviceSupabase.from("pending_admin_invites").insert(
        setupUsers.map((user) => ({
          school_id: schoolData.id,
          email: user.email,
          invite_token: createInviteToken(),
          status: "pending",
          role: user.role,
          permission_keys: user.permissionKeys,
        }))
      );

      if (error) {
        console.error("Setup invites error:", JSON.stringify(error, null, 2));
      }
    }
  }

  if (currentStep === "schedule") {
    // TODO: Generate calendar_days across the school year from the schedule pattern.
  }

  return { schoolData, serviceSupabase };
}

function revalidateAppearanceRoutes(school: string) {
  const setupSteps = [
    "appearance",
    "branding",
    "administrators",
    "users",
    "schedule",
    "complete",
  ];
  const adminBases = [`/${school}/admin`, `/admin/${school}`];

  for (const adminBase of adminBases) {
    revalidatePath(adminBase);
    revalidatePath(`${adminBase}/setup`);

    for (const setupStep of setupSteps) {
      revalidatePath(`${adminBase}/setup/${setupStep}`);
    }
  }

  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/admin/setup", "layout");
  revalidatePath("/admin/[school]/setup", "layout");
}

function revalidateSetupProgressRoutes(school: string) {
  // The setup progress sidebar lives in the school admin layout. Revalidate the
  // internal route destination used by localhost, www, and admin-host rewrites.
  revalidatePath(`/${school}/admin`, "layout");
  revalidatePath(`/${school}/admin/setup`, "layout");
  revalidatePath("/[school]/admin", "layout");
}

function revalidateSetupLogoRoutes(school: string) {
  const paths = [
    `/${school}`,
    `/${school}/admin`,
    `/${school}/admin/setup`,
    `/${school}/admin/setup/school-profile`,
    `/${school}/admin/setup/appearance`,
    `/${school}/app`,
    `/${school}/kiosk`,
    `/admin/${school}`,
    `/admin/${school}/setup`,
    `/admin/${school}/setup/school-profile`,
    `/admin/${school}/setup/appearance`,
  ];

  for (const path of paths) {
    revalidatePath(path);
  }

  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/app", "layout");
  revalidatePath("/[school]/kiosk", "page");
}

export async function updateSetupLogoAction(school: string, logoUrl: string) {
  const { schoolData, serviceSupabase } = await requireSetupAccess(school);
  const { error } = await serviceSupabase
    .from("schools")
    .update({ logo_url: nullable(cleanMultilineText(logoUrl)) })
    .eq("id", schoolData.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSetupLogoRoutes(school);
}

export async function uploadSetupLogoAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a logo file to upload.");
  }

  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    throw new Error("Use a PNG, JPG, WEBP, or SVG logo.");
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new Error("Logo must be 2MB or smaller.");
  }

  const { schoolData, serviceSupabase } = await requireSetupAccess(school);
  const extension = getLogoExtension(file);
  const filePath = `logos/${school}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await serviceSupabase.storage
    .from("school-logos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = serviceSupabase.storage
    .from("school-logos")
    .getPublicUrl(filePath);
  const logoUrl = data.publicUrl;
  const { error: updateError } = await serviceSupabase
    .from("schools")
    .update({ logo_url: logoUrl })
    .eq("id", schoolData.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateSetupLogoRoutes(school);

  return { logoUrl };
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
  revalidateSetupProgressRoutes(school);
  if (currentStep === "appearance") {
    revalidateAppearanceRoutes(school);
  }
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
  revalidateSetupProgressRoutes(school);
  if (currentStep === "appearance") {
    revalidateAppearanceRoutes(school);
  }
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
  revalidateSetupProgressRoutes(school);
  if (currentStep === "appearance") {
    revalidateAppearanceRoutes(school);
  }
  redirect(await getSchoolAdminPath(school));
}
