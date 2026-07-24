import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSchoolAdminRole,
  isSuperAdminRole,
  normalizeAdminRole,
} from "@/lib/userAccess";
import { getForwardedHost, parseSundialHost } from "@/lib/routing/hosts";
import {
  getAdminUtilityPath as getVisibleAdminUtilityPath,
  getSchoolAdminPath as getVisibleSchoolAdminPath,
  getSchoolSetupPath as getVisibleSchoolSetupPath,
  getSchoolSetupStepPath as getVisibleSchoolSetupStepPath,
} from "@/lib/routing/paths";
import type { SetupStepSlug } from "@/lib/setupSteps";
import { isSchoolAvailableById } from "@/lib/schools";

export const ADMIN_PERMISSION_KEYS = [
  "announcements",
  "events",
  "athletics",
  "schedules",
  "calendar",
  "resources",
  "kiosk",
  "analytics",
  "users",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

export type CurrentAdminProfile = {
  id: string;
  first_name: string | null;
  role: string | null;
  school_id: string | null;
  district_id?: string | null;
  is_active: boolean | null;
};

type PermissionRow = {
  permissions: {
    key: string | null;
  } | null;
};

export type CurrentAdminUser = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  profile: CurrentAdminProfile;
  permissionKeys: AdminPermissionKey[];
};

async function getRequestHost() {
  const headerStore = await headers();
  return getForwardedHost(headerStore);
}

async function getRequestPathname() {
  const headerStore = await headers();
  return headerStore.get("x-sundial-pathname") || "/";
}

async function getAdminLoginPath(school: string) {
  const parsedHost = parseSundialHost(await getRequestHost());

  if (parsedHost.kind === "dev" && !parsedHost.school) {
    return "/admin";
  }

  return `/${school}/login`;
}

export async function getSchoolAdminPath(school: string) {
  const host = await getRequestHost();
  const pathname = await getRequestPathname();
  const parsedHost = parseSundialHost(host);

  if (parsedHost.kind === "admin") {
    return getVisibleSchoolAdminPath(school, pathname, parsedHost.hostname);
  }

  if (parsedHost.kind === "dev" && !parsedHost.school) {
    return getVisibleSchoolAdminPath(school, pathname, parsedHost.hostname);
  }

  return getVisibleSchoolAdminPath(school, pathname, parsedHost.hostname);
}

export async function getSchoolSetupPath(school: string) {
  const host = await getRequestHost();
  const pathname = await getRequestPathname();
  const parsedHost = parseSundialHost(host);

  return getVisibleSchoolSetupPath(school, pathname, parsedHost.hostname);
}

export async function getSchoolSetupStepPath(school: string, step: SetupStepSlug) {
  const host = await getRequestHost();
  const pathname = await getRequestPathname();
  const parsedHost = parseSundialHost(host);

  return getVisibleSchoolSetupStepPath(school, pathname, parsedHost.hostname, step);
}

async function getSchoolSitePath(school: string) {
  const parsedHost = parseSundialHost(await getRequestHost());

  if (parsedHost.kind === "school" || (parsedHost.kind === "dev" && parsedHost.school)) {
    return "/";
  }

  return `/${school}`;
}

async function getAdminUtilityPath(path: string) {
  const host = await getRequestHost();
  const pathname = await getRequestPathname();
  const parsedHost = parseSundialHost(host);

  return getVisibleAdminUtilityPath(pathname, parsedHost.hostname, path);
}

function isEditorRole(role: string | null | undefined) {
  return normalizeAdminRole(role) === "editor";
}

function isStaffRole(role: string | null | undefined) {
  return normalizeAdminRole(role) === "staff";
}

function isPermissionKey(key: string | null | undefined): key is AdminPermissionKey {
  return ADMIN_PERMISSION_KEYS.includes(key as AdminPermissionKey);
}

function allAdminPermissionKeys() {
  return [...ADMIN_PERMISSION_KEYS];
}

function canUsePortal(profile: CurrentAdminProfile, schoolId: string) {
  if (!profile.is_active || isStaffRole(profile.role)) return false;
  if (isSuperAdminRole(profile.role)) return true;
  if (isSchoolAdminRole(profile.role) || isEditorRole(profile.role)) {
    return profile.school_id === schoolId;
  }
  return false;
}

function canUseSection(
  profile: CurrentAdminProfile,
  schoolId: string,
  permissionKey: AdminPermissionKey,
  permissionKeys: AdminPermissionKey[]
) {
  if (!canUsePortal(profile, schoolId)) return false;
  if (isSuperAdminRole(profile.role)) return true;
  if (isSchoolAdminRole(profile.role)) return profile.school_id === schoolId;
  if (isEditorRole(profile.role)) {
    return (
      profile.school_id === schoolId &&
      permissionKey !== "users" &&
      permissionKeys.includes(permissionKey)
    );
  }
  return false;
}

const FEATURE_GATED_ADMIN_SECTIONS: Partial<Record<AdminPermissionKey,string>> = {
  announcements: "announcements",
  events: "events",
  athletics: "athletics",
  resources: "resources",
  kiosk: "kiosk",
};

async function getEditorPermissionKeys(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("permissions(key)")
    .eq("user_id", userId)
    .returns<PermissionRow[]>();

  if (error) {
    console.error("Admin permissions error:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data || [])
    .map((row) => row.permissions?.key)
    .filter(isPermissionKey)
    .filter((key) => key !== "users");
}

export async function getCurrentAdminUser(
  schoolId: string
): Promise<CurrentAdminUser | null> {
  if (!(await isSchoolAvailableById(schoolId))) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, first_name, role, school_id, is_active")
    .eq("id", user.id)
    .maybeSingle<CurrentAdminProfile>();

  if (!profile || !profile.is_active) {
    return null;
  }

  let effectiveProfile = profile;
  if (!isSuperAdminRole(profile.role)) {
    const { data: membership, error: membershipError } = await supabase
      .from("school_memberships")
      .select("role, school_id, is_active")
      .eq("user_id", profile.id)
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .maybeSingle<{ role: string; school_id: string; is_active: boolean }>();

    if (membership) {
      effectiveProfile = { ...profile, role: membership.role, school_id: membership.school_id };
    } else if (!membershipError && profile.school_id !== schoolId) {
      return { supabase, profile, permissionKeys: [] };
    }
  }

  if (isSuperAdminRole(effectiveProfile.role) || isSchoolAdminRole(effectiveProfile.role)) {
    return { supabase, profile: effectiveProfile, permissionKeys: allAdminPermissionKeys() };
  }

  if (isEditorRole(effectiveProfile.role) && effectiveProfile.school_id === schoolId) {
    return {
      supabase,
      profile: effectiveProfile,
      permissionKeys: await getEditorPermissionKeys(supabase, effectiveProfile.id),
    };
  }

  return { supabase, profile: effectiveProfile, permissionKeys: [] };
}

export async function canAccessAdminSection(
  schoolId: string,
  permissionKey: AdminPermissionKey
) {
  const adminUser = await getCurrentAdminUser(schoolId);
  if (!adminUser) return false;
  return canUseSection(
    adminUser.profile,
    schoolId,
    permissionKey,
    adminUser.permissionKeys
  );
}

export async function requireAdminPortalAccess(schoolId: string, school: string) {
  const adminUser = await getCurrentAdminUser(schoolId);

  if (!adminUser) {
    redirect(await getAdminLoginPath(school));
  }

  if (!canUsePortal(adminUser.profile, schoolId)) {
    redirect(await getSchoolSitePath(school));
  }

  return adminUser;
}

export async function requireAdminSectionAccess(
  schoolId: string,
  permissionKey: AdminPermissionKey,
  school: string
) {
  const adminUser = await getCurrentAdminUser(schoolId);

  if (!adminUser) {
    redirect(await getAdminLoginPath(school));
  }

  if (
    !canUseSection(
      adminUser.profile,
      schoolId,
      permissionKey,
      adminUser.permissionKeys
    )
  ) {
    redirect(await getSchoolAdminPath(school));
  }

  const featureKey = FEATURE_GATED_ADMIN_SECTIONS[permissionKey];
  if (featureKey) {
    const { data: enabled } = await adminUser.supabase.rpc("school_feature_is_enabled", {
      p_school_id: schoolId,
      p_feature_key: featureKey,
    });
    if (enabled !== true) redirect(await getSchoolAdminPath(school));
  }

  return adminUser;
}

export async function requireSuperAdminAccess() {
  const supabase = await createSupabaseServerClient();
  const adminBasePath = await getAdminUtilityPath("/dashboard");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(await getAdminUtilityPath("/"));
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, first_name, role, school_id, district_id, is_active")
    .eq("id", user.id)
    .maybeSingle<CurrentAdminProfile>();

  if (!profile?.is_active) {
    redirect(await getAdminUtilityPath("/select-school"));
  }

  if (!isSuperAdminRole(profile.role)) {
    if (profile.school_id) {
      const { data: school } = await supabase
        .from("schools")
        .select("subdomain")
        .eq("id", profile.school_id)
        .maybeSingle<{ subdomain: string }>();

      if (school?.subdomain) {
        redirect(await getSchoolAdminPath(school.subdomain));
      }
    }

    redirect(await getAdminUtilityPath("/select-school"));
  }

  return { supabase, profile, adminBasePath };
}
