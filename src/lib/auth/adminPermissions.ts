import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSchoolAdminRole,
  isSuperAdminRole,
  normalizeAdminRole,
} from "@/lib/userAccess";

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
    redirect(`/${school}/login`);
  }

  if (!canUsePortal(adminUser.profile, schoolId)) {
    redirect(`/${school}`);
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
    redirect(`/${school}/login`);
  }

  if (
    !canUseSection(
      adminUser.profile,
      schoolId,
      permissionKey,
      adminUser.permissionKeys
    )
  ) {
    redirect(`/${school}/admin`);
  }

  return adminUser;
}
