"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getSchoolAdminPath,
  getSchoolSetupStepPath,
  requireAdminPortalAccess,
} from "@/lib/auth/adminPermissions";
import { validateLogoFileForUpload } from "@/lib/logoFiles";
import { getSchoolForSetup, isSchoolSetupComplete } from "@/lib/schools";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanMultilineText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function cleanColor(value: FormDataEntryValue | null, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanAppearance(value: FormDataEntryValue | null) {
  const appearance = String(value || "").trim();
  return appearance === "light" || appearance === "dark" || appearance === "system"
    ? appearance
    : "system";
}

function nullable(value: string) {
  return value || null;
}

function revalidateSchoolRoutes(school: string) {
  const paths = [
    `/${school}`,
    `/${school}/admin`,
    `/${school}/admin/settings`,
    `/${school}/app`,
    `/${school}/app/schedule`,
    `/${school}/app/events`,
    `/${school}/app/athletics`,
    `/${school}/kiosk`,
    `/admin/${school}`,
    `/admin/${school}/settings`,
  ];

  for (const path of paths) {
    revalidatePath(path);
  }

  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/app", "layout");
  revalidatePath("/[school]/kiosk", "page");
}

async function requireSettingsAccess(school: string) {
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    redirect("/admin/dashboard");
  }

  const adminUser = await requireAdminPortalAccess(schoolData.id, school);
  const canManageSettings =
    isSuperAdminRole(adminUser.profile.role) ||
    isSchoolAdminRole(adminUser.profile.role);

  if (!canManageSettings) {
    redirect(await getSchoolAdminPath(school));
  }

  if (
    !isSuperAdminRole(adminUser.profile.role) &&
    !(await isSchoolSetupComplete(adminUser.supabase, schoolData.id))
  ) {
    redirect(await getSchoolSetupStepPath(school, schoolData.setup_step || "welcome"));
  }

  return schoolData;
}

export async function updateSchoolLogoAction(school: string, logoUrl: string) {
  const schoolData = await requireSettingsAccess(school);
  const serviceSupabase = createSupabaseServiceRoleClient();
  const { error } = await serviceSupabase
    .from("schools")
    .update({ logo_url: nullable(cleanMultilineText(logoUrl)) })
    .eq("id", schoolData.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSchoolRoutes(school);
}

export async function uploadSchoolLogoAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const file = formData.get("logo");
  const originalFile = formData.get("originalLogo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a logo file to upload.");
  }

  const schoolData = await requireSettingsAccess(school);
  const serviceSupabase = createSupabaseServiceRoleClient();
  const logoInfo = await validateLogoFileForUpload(file);

  if (originalFile instanceof File && originalFile.size > 0) {
    const originalInfo = await validateLogoFileForUpload(originalFile);
    const originalPath = `schools/${schoolData.id}/logos/originals/${crypto.randomUUID()}.${originalInfo.extension}`;
    const { error: originalUploadError } = await serviceSupabase.storage
      .from("school-logos")
      .upload(originalPath, originalFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: originalInfo.mimeType,
      });

    if (originalUploadError) {
      throw new Error(originalUploadError.message);
    }
  }

  const extension = logoInfo.extension;
  const filePath = `schools/${schoolData.id}/logos/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await serviceSupabase.storage
    .from("school-logos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: logoInfo.mimeType,
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

  revalidateSchoolRoutes(school);

  return { logoUrl };
}

export async function saveSchoolSettingsAction(formData: FormData) {
  const school = cleanText(formData.get("school"));
  const schoolData = await requireSettingsAccess(school);

  const schoolColor = cleanColor(
    formData.get("primaryColor"),
    schoolData.primary_color || "#2563eb"
  );
  const accentColor = cleanColor(
    formData.get("secondaryColor"),
    schoolData.secondary_color || schoolColor
  );
  const serviceSupabase = createSupabaseServiceRoleClient();
  const { error } = await serviceSupabase
    .from("schools")
    .update({
      name: cleanText(formData.get("schoolName")) || schoolData.name,
      district_name: nullable(cleanText(formData.get("districtName"))),
      mascot: nullable(cleanText(formData.get("mascot"))),
      logo_url: nullable(cleanMultilineText(formData.get("logoUrl"))),
      primary_color: schoolColor,
      secondary_color: accentColor,
      default_appearance: cleanAppearance(formData.get("defaultAppearance")),
      main_office: nullable(cleanText(formData.get("mainOffice"))),
      attendance_office: nullable(cleanText(formData.get("attendanceOffice"))),
      counseling_office: nullable(cleanText(formData.get("counselingOffice"))),
      athletics_office: nullable(cleanText(formData.get("athleticsOffice"))),
      address: nullable(cleanMultilineText(formData.get("address"))),
      phone_number: nullable(cleanText(formData.get("phoneNumber"))),
      school_website: nullable(cleanMultilineText(formData.get("schoolWebsite"))),
    })
    .eq("id", schoolData.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSchoolRoutes(school);
  redirect(`${await getSchoolAdminPath(school)}/settings?saved=1`);
}
