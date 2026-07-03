import { notFound, redirect } from "next/navigation";
import UserAccessForm from "@/components/admin/UserAccessForm";
import {
  filterSavablePermissionIds,
  getOrSeedAdminPermissions,
  type PermissionRow,
} from "@/lib/adminDefaultPermissions";
import {
  canEditTargetUser,
  getPermissionLabel,
  isSuperAdminRole,
  MANAGEABLE_USER_ROLES,
  PRIORITY_PERMISSION_LABELS,
  requireUserManager,
} from "@/lib/adminUsers";

type EditableUser = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  school_id: string | null;
  is_active: boolean | null;
};

type UserPermissionRow = {
  permission_id: string;
};

function sortPermissions(permissions: PermissionRow[]) {
  return [...permissions].sort((a, b) => {
    const aLabel = getPermissionLabel(a);
    const bLabel = getPermissionLabel(b);
    const aPriority = PRIORITY_PERMISSION_LABELS.indexOf(aLabel);
    const bPriority = PRIORITY_PERMISSION_LABELS.indexOf(bLabel);

    if (aPriority !== -1 || bPriority !== -1) {
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    }

    return aLabel.localeCompare(bLabel);
  });
}

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ school: string; userId: string }>;
}) {
  const { school, userId } = await params;
  const { supabase, schoolData, profile } = await requireUserManager(school);

  const [{ data: targetUser }, permissions, { data: userPermissions }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, first_name, last_name, email, role, school_id, is_active")
        .eq("id", userId)
        .single<EditableUser>(),
      getOrSeedAdminPermissions(),
      supabase
        .from("user_permissions")
        .select("permission_id")
        .eq("user_id", userId)
        .returns<UserPermissionRow[]>(),
    ]);

  if (!targetUser) {
    notFound();
  }

  if (!canEditTargetUser({ actor: profile, target: targetUser })) {
    redirect(`/${school}/admin/users`);
  }

  const selectedPermissionIds = new Set((userPermissions || []).map((row) => row.permission_id));
  const permissionRows = sortPermissions(permissions);

  async function updateUser(formData: FormData) {
    "use server";

    const { supabase, profile } = await requireUserManager(school);
    const firstName = String(formData.get("first_name") || "").trim();
    const lastName = String(formData.get("last_name") || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "editor").trim();
    const isActive = formData.get("is_active") === "on";
    const submittedPermissionIds = formData
      .getAll("permission_ids")
      .map((value) => String(value))
      .filter(Boolean);

    const { data: existingUser } = await supabase
      .from("users")
      .select("id, role, school_id")
      .eq("id", userId)
      .single<{ id: string; role: string | null; school_id: string | null }>();

    if (!existingUser || !canEditTargetUser({ actor: profile, target: existingUser })) {
      return;
    }

    const allowedRoles = MANAGEABLE_USER_ROLES.map((option) => option.value);
    const preservingSuperAdmin = isSuperAdminRole(existingUser.role) && isSuperAdminRole(role);
    if (
      !firstName ||
      !lastName ||
      !email ||
      (!allowedRoles.includes(role as never) && !preservingSuperAdmin)
    ) {
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        is_active: isActive,
      })
      .eq("id", userId);

    if (error) {
      console.error("Update user error:", JSON.stringify(error, null, 2));
      return;
    }

    const { error: deleteError } = await supabase
      .from("user_permissions")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Delete user permissions error:", JSON.stringify(deleteError, null, 2));
      return;
    }

    const permissionIds = await filterSavablePermissionIds({
      role,
      permissionIds: submittedPermissionIds,
    });

    if (permissionIds.length > 0) {
      const { error: permissionError } = await supabase.from("user_permissions").insert(
        permissionIds.map((permissionId) => ({
          user_id: userId,
          permission_id: permissionId,
        }))
      );

      if (permissionError) {
        console.error("Update user permissions error:", JSON.stringify(permissionError, null, 2));
        return;
      }
    }

    redirect(`/${school}/admin/users`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">Edit User</h1>
        </div>

        <UserAccessForm
          action={updateUser}
          cancelHref={`/${school}/admin/users`}
          submitLabel="Save Changes"
          permissions={permissionRows}
          preserveSuperAdminRole={isSuperAdminRole(targetUser.role)}
          initialValues={{
            first_name: targetUser.first_name,
            last_name: targetUser.last_name,
            email: targetUser.email,
            role: targetUser.role || "editor",
            is_active: targetUser.is_active,
            permission_ids: Array.from(selectedPermissionIds),
          }}
        />
      </div>
    </main>
  );
}
