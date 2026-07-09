import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  canEditTargetUser,
  formatUserRole,
  getPermissionLabel,
  requireUserManager,
} from "@/lib/adminUsers";

type AdminUserRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  school_id: string | null;
  is_active: boolean | null;
};

type PermissionRow = {
  id: string;
  key: string | null;
  label: string | null;
  description: string | null;
};

type UserPermissionRow = {
  user_id: string;
  permission_id: string;
};

function displayName(user: AdminUserRow) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return user.full_name || name || user.email || "Unnamed user";
}

function activeBadge(isActive: boolean | null) {
  return isActive ? (
    <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-500/30 dark:text-green-300">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-500/20 dark:text-slate-400">
      Inactive
    </span>
  );
}

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const { supabase, schoolData, profile } = await requireUserManager(school);
  const schoolId = schoolData.id;

  async function deactivateUser(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") || "");
    const { supabase, schoolData, profile } = await requireUserManager(school);

    const { data: target } = await supabase
      .from("users")
      .select("id, role, school_id")
      .eq("id", userId)
      .single<{ id: string; role: string | null; school_id: string | null }>();

    if (!target || !canEditTargetUser({ actor: profile, target })) {
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ is_active: false })
      .eq("id", userId)
      .eq("school_id", schoolData.id);

    if (error) {
      console.error("Deactivate user error:", JSON.stringify(error, null, 2));
      return;
    }

    revalidatePath(`/${school}/admin/users`);
  }

  const usersQuery = supabase
    .from("users")
    .select("id, full_name, first_name, last_name, email, role, school_id, is_active")
    .eq("school_id", schoolId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const [
    { data: users, error: usersError },
    { data: permissions, error: permissionsError },
    { data: userPermissions, error: userPermissionsError },
  ] = await Promise.all([
    usersQuery.returns<AdminUserRow[]>(),
    supabase.from("permissions").select("id, key, label, description").returns<PermissionRow[]>(),
    supabase.from("user_permissions").select("user_id, permission_id").returns<UserPermissionRow[]>(),
  ]);

  if (usersError) console.error("Users error:", JSON.stringify(usersError, null, 2));
  if (permissionsError) console.error("Permissions error:", JSON.stringify(permissionsError, null, 2));
  if (userPermissionsError) console.error("User permissions error:", JSON.stringify(userPermissionsError, null, 2));

  const permissionById = new Map((permissions || []).map((permission) => [permission.id, permission]));
  const permissionIdsByUser = new Map<string, string[]>();

  for (const userPermission of userPermissions || []) {
    const next = permissionIdsByUser.get(userPermission.user_id) || [];
    next.push(userPermission.permission_id);
    permissionIdsByUser.set(userPermission.user_id, next);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Users</h1>
          </div>

        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Manage Users</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Add admin access and control which admin sections users can use.
              </p>
            </div>

            <Link
              href={`/${school}/admin/users/new`}
              className="inline-flex w-fit cursor-pointer items-center justify-center rounded-lg bg-[var(--school-primary)] px-3 py-2 text-sm font-medium text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              + New User
            </Link>
          </div>
        </div>

        <section className="space-y-4">
          {!users || users.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
              <h3 className="text-lg font-semibold">No users yet</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                New admin users will appear here after they are created.
              </p>
            </div>
          ) : (
            users.map((user) => {
              const permissionLabels = (permissionIdsByUser.get(user.id) || [])
                .map((permissionId) => permissionById.get(permissionId))
                .filter((permission): permission is PermissionRow => Boolean(permission))
                .map((permission) => getPermissionLabel(permission));
              const editable = canEditTargetUser({ actor: profile, target: user });

              return (
                <article
                  key={user.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-semibold">{displayName(user)}</h3>
                        {activeBadge(user.is_active)}
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Role: {formatUserRole(user.role)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {permissionLabels.length > 0 ? (
                      permissionLabels.map((permission) => (
                        <span
                          key={permission}
                          className="rounded-full bg-[color-mix(in_srgb,var(--school-primary)_14%,white)] px-3 py-1 text-xs font-semibold text-[var(--school-primary)] ring-1 ring-[color-mix(in_srgb,var(--school-primary)_30%,transparent)] dark:bg-[color-mix(in_srgb,var(--school-primary)_22%,#242424)]"
                        >
                          {permission}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500 dark:text-slate-400">No permissions assigned</span>
                    )}
                  </div>

                  <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 dark:border-[#3a3a3a]">
                    {editable ? (
                      <>
                        <Link
                          href={`/${school}/admin/users/${user.id}/edit`}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Edit
                        </Link>
                        {user.is_active && (
                          <form action={deactivateUser}>
                            <input type="hidden" name="user_id" value={user.id} />
                            <button
                              type="submit"
                              className="cursor-pointer rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              Deactivate
                            </button>
                          </form>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        SuperAdmin users can only be managed by SuperAdmins.
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
