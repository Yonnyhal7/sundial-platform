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
import { isSupportedTimeZone } from "@/lib/timezones";
import { fetchSchoolOfflineSnapshot } from "@/lib/offline/fetchSchoolSnapshot.server";

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
    `/${school}/events`,
    `/${school}/athletics`,
    `/${school}/calendar`,
    `/${school}/kiosk`,
    `/admin/${school}`,
    `/admin/${school}/settings`,
    `/api/schools/${school}/offline-snapshot`,
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

  return { schoolData, adminUser };
}

export async function updateSchoolLogoAction(school: string, logoUrl: string) {
  const { schoolData } = await requireSettingsAccess(school);
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

  const { schoolData } = await requireSettingsAccess(school);
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
  const { schoolData } = await requireSettingsAccess(school);

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

export type SchoolTimezoneActionState = {
  status: "idle" | "success" | "refresh_warning" | "validation_error" | "stale" | "server_error";
  message?: string;
  timezone?: string;
  version?: number;
};

type TimezoneRpcResult = { status?: string; timezone?: string; version?: number };

function safeDatabaseCode(error: unknown) {
  if (!error || typeof error !== "object") return "unknown";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value.slice(0, 32) : "unknown";
}

async function refreshTimezoneConsumers(school: string, schoolId: string) {
  revalidateSchoolRoutes(school);
  try {
    await fetchSchoolOfflineSnapshot(school);
    return true;
  } catch (error) {
    console.warn("[timezone] post-save refresh failed", {
      stage: "offline_snapshot_regeneration",
      schoolId,
      code: safeDatabaseCode(error),
    });
    return false;
  }
}

export async function saveSchoolTimezoneAction(
  _state: SchoolTimezoneActionState,
  formData: FormData
): Promise<SchoolTimezoneActionState> {
  const allowed = new Set(["school", "timezone", "version", "confirmed"]);
  if ([...formData.keys()].some((key) => !allowed.has(key))) {
    return { status: "validation_error", message: "Unknown timezone setting submitted." };
  }

  const school = cleanText(formData.get("school"));
  const timezone = String(formData.get("timezone") || "");
  const version = Number(formData.get("version"));
  const confirmed = formData.get("confirmed") === "true";
  if (!isSupportedTimeZone(timezone)) {
    return { status: "validation_error", message: "Choose a supported IANA timezone." };
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    return { status: "validation_error", message: "Reload the settings page and try again." };
  }
  if (!confirmed) {
    return { status: "validation_error", message: "Confirm the timezone change before saving." };
  }

  const { schoolData, adminUser } = await requireSettingsAccess(school);
  const { data, error } = await adminUser.supabase
    .rpc("update_school_timezone", {
      p_school_id: schoolData.id,
      p_expected_version: version,
      p_timezone: timezone,
      p_confirmed: true,
    })
    .single<TimezoneRpcResult>();

  if (error || !data) {
    return { status: "server_error", message: "Sundial could not update the school timezone." };
  }
  if (data.status === "stale") {
    return { status: "stale", message: "The timezone changed elsewhere. Reload before saving.", version: data.version };
  }
  if (data.status === "permission_error") {
    return { status: "server_error", message: "You are not authorized to change this school timezone." };
  }
  if (data.status === "school_unavailable" || data.status === "not_found") {
    return { status: "server_error", message: "This school is unavailable." };
  }
  if (data.status === "invalid_timezone" || data.status === "confirmation_required") {
    return { status: "validation_error", message: "The timezone change was rejected." };
  }
  if (!new Set(["success", "no_change"]).has(data.status || "")) {
    return { status: "server_error", message: "Sundial could not update the school timezone." };
  }

  const refreshed = await refreshTimezoneConsumers(school, schoolData.id);
  if (!refreshed) {
    return {
      status: "refresh_warning",
      message: "Timezone saved, but the offline snapshot refresh needs to be retried.",
      timezone: data.timezone || timezone,
      version: data.version,
    };
  }
  return {
    status: "success",
    message: data.status === "no_change" ? "The school timezone is already current." : "School timezone updated.",
    timezone: data.timezone || timezone,
    version: data.version,
  };
}

export async function retrySchoolTimezoneSyncAction(
  _state: SchoolTimezoneActionState,
  formData: FormData
): Promise<SchoolTimezoneActionState> {
  const school = cleanText(formData.get("school"));
  const { schoolData } = await requireSettingsAccess(school);
  const refreshed = await refreshTimezoneConsumers(school, schoolData.id);
  return refreshed
    ? { status: "success", message: "Offline timezone data refreshed." }
    : { status: "refresh_warning", message: "The offline refresh still could not complete. Try again." };
}
