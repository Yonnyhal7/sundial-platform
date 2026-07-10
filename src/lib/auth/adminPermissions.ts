import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSchoolAdminRole,
  isSuperAdminRole,
  normalizeAdminRole,
} from "@/lib/userAccess";
import { getForwardedHost, parseSundialHost } from "@/lib/routing/hosts";
import type { SetupStepSlug } from "@/lib/setupSteps";

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

async function getAdminLoginPath(school: string) {
  const parsedHost = parseSundialHost(await getRequestHost());

  if (parsedHost.kind === "dev" && !parsedHost.school) {
    return "/admin";
  }

  return `/${school}/login`;
}

export async function getSchoolAdminPath(school: string) {
  const parsedHost = parseSundialHost(await getRequestHost());

  if (parsedHost.kind === "admin") {
    return `/${school}/dashboard`;
  }

  if (parsedHost.kind === "dev" && !parsedHost.school) {
    return `/admin/${school}`;
  }

  return `/${school}/admin`;
}

export async function getSchoolSetupPath(school: string) {
  return `${await getSchoolAdminPath(school)}/setup`;
}

export async function getSchoolSetupStepPath(school: string, step: SetupStepSlug) {
  return `${await getSchoolSetupPath(school)}/${step}`;
}

async function getSchoolSitePath(school: string) {
  const parsedHost = parseSundialHost(await getRequestHost());

  if (parsedHost.kind === "school" || (parsedHost.kind === "dev" && parsedHost.school)) {
    return "/";
  }

  return `/${school}`;
}

async function getAdminUtilityPath(path: string) {
  const parsedHost = parseSundialHost(await getRequestHost());
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return parsedHost.kind === "dev" ? `/admin${normalizedPath}` : normalizedPath;
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

  if (isSuperAdminRole(profile.role) || isSchoolAdminRole(profile.role)) {
    return { supabase, profile, permissionKeys: allAdminPermissionKeys() };
  }

  if (isEditorRole(profile.role) && profile.school_id === schoolId) {
    return {
      supabase,
      profile,
      permissionKeys: await getEditorPermissionKeys(supabase, profile.id),
    };
  }

  return { supabase, profile, permissionKeys: [] };
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
