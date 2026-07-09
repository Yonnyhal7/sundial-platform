"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getPermissionLabel,
  isAnalyticsPermission,
  isEditorDefaultPermission,
  isUsersPermission,
  MANAGEABLE_USER_ROLES,
} from "@/lib/userAccess";

export type UserAccessPermission = {
  id: string;
  key: string | null;
  label: string | null;
  description: string | null;
};

type UserAccessFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  submitLabel: string;
  initialValues?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    role?: string | null;
    is_active?: boolean | null;
    permission_ids?: string[];
  };
  permissions: UserAccessPermission[];
  preserveSuperAdminRole?: boolean;
};

function getRoleDefaults(role: string, permissions: UserAccessPermission[]) {
  if (role === "school_admin") {
    return [];
  }

  if (role === "editor") {
    return permissions
      .filter((permission) => isEditorDefaultPermission(permission))
      .map((permission) => permission.id);
  }

  return [];
}

export default function UserAccessForm({
  action,
  cancelHref,
  submitLabel,
  initialValues,
  permissions,
  preserveSuperAdminRole = false,
}: UserAccessFormProps) {
  const initialRole = preserveSuperAdminRole
    ? "super_admin"
    : initialValues?.role || "editor";
  const [role, setRole] = useState(initialRole);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(
    () => new Set(initialValues?.permission_ids || [])
  );

  const permissionGroups = useMemo(() => {
    return permissions.map((permission) => ({
      ...permission,
      label: getPermissionLabel(permission),
      sensitive: isUsersPermission(permission) || isAnalyticsPermission(permission),
    }));
  }, [permissions]);
  const editorPermissionGroups = useMemo(
    () => permissionGroups.filter((permission) => !isUsersPermission(permission)),
    [permissionGroups]
  );

  function handleRoleChange(nextRole: string) {
    setRole(nextRole);
    setSelectedPermissionIds(new Set(getRoleDefaults(nextRole, permissions)));
  }

  function togglePermission(permissionId: string, checked: boolean) {
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permissionId);
      } else {
        next.delete(permissionId);
      }
      return next;
    });
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white";
  const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";

  return (
    <form
      action={action}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>First Name</label>
          <input
            name="first_name"
            required
            defaultValue={initialValues?.first_name || ""}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Last Name</label>
          <input
            name="last_name"
            required
            defaultValue={initialValues?.last_name || ""}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Email</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={initialValues?.email || ""}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Role</label>
          {preserveSuperAdminRole ? (
            <>
              <input type="hidden" name="role" value="super_admin" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 dark:border-[#3a3a3a] dark:bg-black/30 dark:text-white">
                Super Admin
              </div>
            </>
          ) : (
            <select
              name="role"
              required
              value={role}
              onChange={(event) => handleRoleChange(event.target.value)}
              className={inputClass}
            >
              {MANAGEABLE_USER_ROLES.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30 sm:col-span-2">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={initialValues?.is_active ?? true}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Active user
          </span>
        </label>
      </div>

      <section className="mt-8 border-t border-slate-200 pt-6 dark:border-[#3a3a3a]">
        <h2 className="text-lg font-bold">Permissions</h2>
        {role === "school_admin" || role === "super_admin" ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-[#3a3a3a] dark:bg-black/30 dark:text-slate-200">
            Administrators have full access.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose the admin sections this editor can access.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {editorPermissionGroups.map((permission) => (
                <label
                  key={permission.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30"
                >
                  <input
                    name="permission_ids"
                    type="checkbox"
                    value={permission.id}
                    checked={selectedPermissionIds.has(permission.id)}
                    onChange={(event) => togglePermission(permission.id, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                  />
                  <span className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
                    <span className="block font-semibold">{permission.label}</span>
                    {permission.description && (
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        {permission.description}
                      </span>
                    )}
                    {permission.sensitive && (
                      <span className="mt-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-200">
                        Admin access
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {editorPermissionGroups.length === 0 && (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-[#3a3a3a] dark:bg-black/30 dark:text-slate-400">
                No editor permissions have been configured yet.
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
