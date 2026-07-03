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

  return (
    <form action={action} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">First Name</label>
          <input
            name="first_name"
            required
            defaultValue={initialValues?.first_name || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Last Name</label>
          <input
            name="last_name"
            required
            defaultValue={initialValues?.last_name || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-300">Email</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={initialValues?.email || ""}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-300">Role</label>
          {preserveSuperAdminRole ? (
            <>
              <input type="hidden" name="role" value="super_admin" />
              <div className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white">
                Super Admin
              </div>
            </>
          ) : (
            <select
              name="role"
              required
              value={role}
              onChange={(event) => handleRoleChange(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
            >
              {MANAGEABLE_USER_ROLES.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 sm:col-span-2">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={initialValues?.is_active ?? true}
            className="h-4 w-4 rounded border-slate-600"
          />
          <span className="text-sm text-slate-300">Active user</span>
        </label>
      </div>

      <section className="mt-8 border-t border-slate-800 pt-6">
        <h2 className="text-lg font-semibold">Permissions</h2>
        {role === "school_admin" || role === "super_admin" ? (
          <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Administrators have full access.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-400">
              Choose the admin sections this editor can access.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {editorPermissionGroups.map((permission) => (
                <label
                  key={permission.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <input
                    name="permission_ids"
                    type="checkbox"
                    value={permission.id}
                    checked={selectedPermissionIds.has(permission.id)}
                    onChange={(event) => togglePermission(permission.id, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-600"
                  />
                  <span className="min-w-0 text-sm text-slate-300">
                    <span className="block font-medium">{permission.label}</span>
                    {permission.description && (
                      <span className="mt-1 block text-xs text-slate-500">
                        {permission.description}
                      </span>
                    )}
                    {permission.sensitive && (
                      <span className="mt-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/25">
                        Admin access
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {editorPermissionGroups.length === 0 && (
              <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                No editor permissions have been configured yet.
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
