import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export type PermissionRow = {
  id: string;
  key: string | null;
  label: string | null;
  description: string | null;
};

export const DEFAULT_ADMIN_PERMISSIONS = [
  {
    key: "announcements",
    label: "Announcements",
    description: "Create and manage school announcements",
  },
  {
    key: "events",
    label: "Events",
    description: "Create and manage school events",
  },
  {
    key: "athletics",
    label: "Athletics",
    description: "Create and manage sports, teams, and games",
  },
  {
    key: "schedules",
    label: "Schedules",
    description: "Create and manage bell schedules",
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "Assign schedules to calendar days",
  },
  {
    key: "resources",
    label: "Resources",
    description: "Create and manage school resources",
  },
  {
    key: "kiosk",
    label: "Kiosk",
    description: "Manage kiosk display settings",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "View school analytics",
  },
  {
    key: "users",
    label: "Users",
    description: "Manage users and permissions",
  },
] as const;

const DEFAULT_ADMIN_PERMISSION_KEYS = DEFAULT_ADMIN_PERMISSIONS.map(
  (permission) => permission.key
);

export async function getOrSeedAdminPermissions() {
  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data, error } = await serviceSupabase
    .from("permissions")
    .select("id, key, label, description")
    .returns<PermissionRow[]>();

  if (error) {
    console.error("Permissions error:", JSON.stringify(error, null, 2));
    return [];
  }

  const defaultRows = (data || []).filter((permission) =>
    DEFAULT_ADMIN_PERMISSION_KEYS.includes(
      permission.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
    )
  );
  const existingDefaultKeys = new Set(defaultRows.map((permission) => permission.key));
  const missingDefaults = DEFAULT_ADMIN_PERMISSIONS.filter(
    (permission) => !existingDefaultKeys.has(permission.key)
  );

  if (missingDefaults.length === 0) {
    return defaultRows;
  }

  const { data: insertedPermissions, error: seedError } = await serviceSupabase
    .from("permissions")
    .insert(missingDefaults)
    .select("id, key, label, description")
    .returns<PermissionRow[]>();

  if (seedError) {
    console.error("Seed permissions error:", JSON.stringify(seedError, null, 2));

    const { data: retryPermissions, error: retryError } = await serviceSupabase
      .from("permissions")
      .select("id, key, label, description")
      .returns<PermissionRow[]>();

    if (retryError) {
      console.error("Retry permissions error:", JSON.stringify(retryError, null, 2));
      return [];
    }

    return (retryPermissions || []).filter((permission) =>
      DEFAULT_ADMIN_PERMISSION_KEYS.includes(
        permission.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
      )
    );
  }

  if (insertedPermissions && insertedPermissions.length > 0) {
    return sortDefaultPermissions([...defaultRows, ...insertedPermissions]);
  }

  const { data: seededPermissions, error: seededError } = await serviceSupabase
    .from("permissions")
    .select("id, key, label, description")
    .returns<PermissionRow[]>();

  if (seededError) {
    console.error("Reload permissions error:", JSON.stringify(seededError, null, 2));
    return [];
  }

  return sortDefaultPermissions(
    (seededPermissions || []).filter((permission) =>
      DEFAULT_ADMIN_PERMISSION_KEYS.includes(
        permission.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
      )
    )
  );
}

function sortDefaultPermissions(permissions: PermissionRow[]) {
  return [...permissions].sort(
    (a, b) =>
      DEFAULT_ADMIN_PERMISSION_KEYS.indexOf(
        a.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
      ) -
      DEFAULT_ADMIN_PERMISSION_KEYS.indexOf(
        b.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
      )
  );
}

export async function filterSavablePermissionIds({
  role,
  permissionIds,
}: {
  role: string;
  permissionIds: string[];
}) {
  if (role !== "editor" || permissionIds.length === 0) {
    return [];
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data, error } = await serviceSupabase
    .from("permissions")
    .select("id, key")
    .in("id", permissionIds)
    .returns<Array<{ id: string; key: string | null }>>();

  if (error) {
    console.error("Validate permissions error:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data || [])
    .filter(
      (permission) =>
        DEFAULT_ADMIN_PERMISSION_KEYS.includes(
          permission.key as (typeof DEFAULT_ADMIN_PERMISSION_KEYS)[number]
        ) && permission.key !== "users"
    )
    .map((permission) => permission.id);
}
