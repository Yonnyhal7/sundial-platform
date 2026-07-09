"use client";

import { useMemo, useState } from "react";
import { getPermissionLabel, isEditorDefaultPermission } from "@/lib/userAccess";
import type { PermissionRow } from "@/lib/adminDefaultPermissions";

type SetupUserRole = "school_admin" | "editor";

type SetupUser = {
  id: string;
  email: string;
  role: SetupUserRole;
  permissionKeys: string[];
};

type UsersFormContentProps = {
  permissions: PermissionRow[];
  initialUsers: SetupUser[];
};

const roleLabels: Record<SetupUserRole, string> = {
  school_admin: "Administrator",
  editor: "Editor",
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getEditorDefaultKeys(permissions: PermissionRow[]) {
  return permissions
    .filter((permission) => isEditorDefaultPermission(permission))
    .map((permission) => permission.key)
    .filter((key): key is string => Boolean(key));
}

function getAllPermissionKeys(permissions: PermissionRow[]) {
  return permissions
    .map((permission) => permission.key)
    .filter((key): key is string => Boolean(key));
}

function summarizePermissions(user: SetupUser, permissions: PermissionRow[]) {
  if (user.role === "school_admin") {
    return "All permissions";
  }

  const labels = user.permissionKeys
    .map((key) => permissions.find((permission) => permission.key === key))
    .filter((permission): permission is PermissionRow => Boolean(permission))
    .map((permission) => getPermissionLabel(permission));

  if (labels.length === 0) {
    return "No permissions selected";
  }

  if (labels.length <= 3) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

export default function UsersFormContent({
  permissions,
  initialUsers,
}: UsersFormContentProps) {
  const allPermissionKeys = useMemo(() => getAllPermissionKeys(permissions), [permissions]);
  const editorDefaultKeys = useMemo(
    () => getEditorDefaultKeys(permissions),
    [permissions]
  );
  const [users, setUsers] = useState<SetupUser[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SetupUserRole>("editor");
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<Set<string>>(
    () => new Set(editorDefaultKeys)
  );
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const effectivePermissionKeys =
    role === "school_admin" ? allPermissionKeys : Array.from(selectedPermissionKeys);

  function resetForm() {
    setEmail("");
    setRole("editor");
    setSelectedPermissionKeys(new Set(editorDefaultKeys));
    setEditingUserId(null);
    setError("");
  }

  function handleRoleChange(nextRole: SetupUserRole) {
    setRole(nextRole);
    setSelectedPermissionKeys(
      nextRole === "school_admin"
        ? new Set(allPermissionKeys)
        : new Set(editorDefaultKeys)
    );
  }

  function togglePermission(permissionKey: string, checked: boolean) {
    setSelectedPermissionKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permissionKey);
      } else {
        next.delete(permissionKey);
      }
      return next;
    });
  }

  function addOrUpdateUser() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    const duplicate = users.some(
      (user) => user.email === normalizedEmail && user.id !== editingUserId
    );

    if (duplicate) {
      setError("That user has already been added.");
      return;
    }

    const nextUser: SetupUser = {
      id: editingUserId || crypto.randomUUID(),
      email: normalizedEmail,
      role,
      permissionKeys: effectivePermissionKeys,
    };

    setUsers((current) =>
      editingUserId
        ? current.map((user) => (user.id === editingUserId ? nextUser : user))
        : [...current, nextUser]
    );
    resetForm();
  }

  function editUser(user: SetupUser) {
    setEmail(user.email);
    setRole(user.role);
    setSelectedPermissionKeys(new Set(user.permissionKeys));
    setEditingUserId(user.id);
    setError("");
  }

  function removeUser(userId: string) {
    setUsers((current) => current.filter((user) => user.id !== userId));
    if (editingUserId === userId) {
      resetForm();
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Step 4
      </p>
      <h2 className="mt-2 text-2xl font-bold">Users</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
        Add additional administrators and editors who should have access to manage
        your school.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
        You do not need to add yourself. Your administrator account has already
        been created.
      </p>

      <input type="hidden" name="setupUsers" value={JSON.stringify(users)} />

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold">Add User</h3>
          {editingUserId && (
            <button
              type="button"
              onClick={resetForm}
              className="w-fit text-sm font-semibold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="text-sm font-semibold">
            Email Address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="assistant-principal@school.edu"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            Role
            <select
              value={role}
              onChange={(event) => handleRoleChange(event.target.value as SetupUserRole)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-slate-700 dark:bg-black dark:text-white"
            >
              <option value="school_admin">Administrator</option>
              <option value="editor">Editor</option>
            </select>
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Permissions</legend>
          {role === "school_admin" && (
            <p className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-black dark:text-slate-400">
              Administrators automatically receive all permissions.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {permissions.map((permission) => {
              const permissionKey = permission.key || permission.id;
              const checked =
                role === "school_admin" || selectedPermissionKeys.has(permissionKey);

              return (
                <label
                  key={permission.id}
                  className={[
                    "flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition",
                    checked
                      ? "border-[var(--school-primary)] bg-blue-50 dark:bg-white/10"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-black",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    value={permissionKey}
                    checked={checked}
                    disabled={role === "school_admin"}
                    onChange={(event) =>
                      togglePermission(permissionKey, event.target.checked)
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-semibold">
                      {getPermissionLabel(permission)}
                    </span>
                    {permission.description && (
                      <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                        {permission.description}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={addOrUpdateUser}
          className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--school-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
        >
          {editingUserId ? "Save User" : "+ Add User"}
        </button>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Current Users</h3>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {users.length} added
          </span>
        </div>

        {users.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Added administrators and editors will appear here.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="hidden grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1.5fr)_10rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:bg-black/30 dark:text-slate-400 md:grid">
              <span>Email</span>
              <span>Role</span>
              <span>Permission Summary</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {users.map((user) => (
                <article
                  key={user.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1.5fr)_10rem] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{user.email}</p>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {roleLabels[user.role]}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {summarizePermissions(user, permissions)}
                  </p>
                  <div className="flex gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => editUser(user)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUser(user.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-200 dark:hover:bg-red-950/30"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
