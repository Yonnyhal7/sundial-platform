import { redirect } from "next/navigation";
import UserAccessForm from "@/components/admin/UserAccessForm";
import {
  filterSavablePermissionIds,
  getOrSeedAdminPermissions,
  type PermissionRow,
} from "@/lib/adminDefaultPermissions";
import { getPermissionLabel, MANAGEABLE_USER_ROLES, PRIORITY_PERMISSION_LABELS, requireUserManager } from "@/lib/adminUsers";

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

export default async function NewUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school } = await params;
  const { error: errorParam } = await searchParams;
  const { schoolData } = await requireUserManager(school);

  const permissionRows = sortPermissions(await getOrSeedAdminPermissions());

  async function createUser(formData: FormData) {
    "use server";

    const { supabase, schoolData } = await requireUserManager(school);
    const firstName = String(formData.get("first_name") || "").trim();
    const lastName = String(formData.get("last_name") || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role")).trim();
    const isActive = formData.get("is_active") === "on";
    const submittedPermissionIds = formData
      .getAll("permission_ids")
      .map((value) => String(value))
      .filter(Boolean);

    const allowedRoles = MANAGEABLE_USER_ROLES.map((option) => option.value);
    if (!firstName || !lastName || !email || !allowedRoles.includes(role as never)) {
      redirect(`/${school}/admin/users/new?error=1`);
    }

    const { data: createdUser, error } = await supabase
      .from("users")
      .insert({
        school_id: schoolData.id,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        is_active: isActive,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !createdUser) {
      console.error("Create user error:", JSON.stringify(error, null, 2));
      redirect(`/${school}/admin/users/new?error=1`);
    }

    const permissionIds = await filterSavablePermissionIds({
      role,
      permissionIds: submittedPermissionIds,
    });

    await supabase.from("user_permissions").delete().eq("user_id", createdUser.id);

    if (permissionIds.length > 0) {
      const { error: permissionError } = await supabase.from("user_permissions").insert(
        permissionIds.map((permissionId) => ({
          user_id: createdUser.id,
          permission_id: permissionId,
        }))
      );

      if (permissionError) {
        console.error("Create user permissions error:", JSON.stringify(permissionError, null, 2));
      }
    }

    redirect(`/${school}/admin/users`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New User</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this user. Please check the required fields and try again.
          </p>
        )}

        <UserAccessForm
          action={createUser}
          cancelHref={`/${school}/admin/users`}
          submitLabel="Save User"
          permissions={permissionRows}
          initialValues={{ role: "editor", is_active: true }}
        />
      </div>
    </main>
  );
}
