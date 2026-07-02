import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${school}/login`);
  }

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<AdminSchool>();

  if (!schoolData) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, school_id, is_active")
    .eq("id", user.id)
    .single<AdminProfile>();

  if (!profile || !canManageUsers(profile, schoolData.id)) {
    redirect(`/${school}/admin`);
  }

  return { supabase, schoolData, profile };
}
