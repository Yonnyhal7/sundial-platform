import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
export {
  formatUserRole,
  getPermissionLabel,
  isSchoolAdminRole,
  isSuperAdminRole,
  MANAGEABLE_USER_ROLES,
  normalizeAdminRole,
  PRIORITY_PERMISSION_LABELS,
} from "@/lib/userAccess";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

export type AdminProfile = {
  id: string;
  role: string | null;
  school_id: string | null;
  is_active: boolean | null;
};

export type AdminSchool = {
  id: string;
  name: string;
  subdomain: string;
};

export function canManageUsers(profile: AdminProfile | null, schoolId: string) {
  if (!profile?.is_active) return false;
  if (isSuperAdminRole(profile.role)) return true;
  return isSchoolAdminRole(profile.role) && profile.school_id === schoolId;
}

export function canEditTargetUser({
  actor,
  target,
}: {
  actor: AdminProfile;
  target: { role: string | null; school_id: string | null };
}) {
  if (isSuperAdminRole(actor.role)) return true;
  if (!isSchoolAdminRole(actor.role)) return false;
  if (isSuperAdminRole(target.role)) return false;
  return actor.school_id === target.school_id;
}


export async function requireUserManager(school: string) {
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", { subdomain_input: school })
    .single<AdminSchool>();

  if (!schoolData) {
    notFound();
  }

  const adminUser = await requireAdminSectionAccess(schoolData.id, "users", school);

  return { supabase: adminUser.supabase, schoolData, profile: adminUser.profile };
}
