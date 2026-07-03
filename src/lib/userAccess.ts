export type AdminRole = "school_admin" | "editor";

export const MANAGEABLE_USER_ROLES: { value: AdminRole; label: string }[] = [
  { value: "school_admin", label: "Administrator" },
  { value: "editor", label: "Editor" },
];

export const PRIORITY_PERMISSION_LABELS = [
  "Announcements",
  "Events",
  "Athletics",
  "Schedules",
  "Calendar",
  "Resources",
  "Kiosk",
  "Analytics",
  "Users/Staff Management",
];

export function normalizeAdminRole(role: string | null | undefined) {
  return (role || "").replace(/[_\s-]/g, "").toLowerCase();
}

export function isSuperAdminRole(role: string | null | undefined) {
  return normalizeAdminRole(role) === "superadmin";
}

export function isSchoolAdminRole(role: string | null | undefined) {
  return normalizeAdminRole(role) === "schooladmin";
}

export function getPermissionLabel(permission: {
  label?: string | null;
  key?: string | null;
}) {
  return permission.label || permission.key || "Permission";
}

export function getPermissionSearchText(permission: {
  label?: string | null;
  key?: string | null;
  description?: string | null;
}) {
  return `${permission.key || ""} ${permission.label || ""} ${permission.description || ""}`.toLowerCase();
}

export function isUsersPermission(permission: {
  label?: string | null;
  key?: string | null;
  description?: string | null;
}) {
  const text = getPermissionSearchText(permission);
  return text.includes("user") || text.includes("staff");
}

export function isAnalyticsPermission(permission: {
  label?: string | null;
  key?: string | null;
  description?: string | null;
}) {
  return getPermissionSearchText(permission).includes("analytics");
}

export function isEditorDefaultPermission(permission: {
  label?: string | null;
  key?: string | null;
  description?: string | null;
}) {
  return !isUsersPermission(permission) && !isAnalyticsPermission(permission);
}

export function formatUserRole(role: string | null | undefined) {
  if (isSuperAdminRole(role)) return "Super Admin";
  if (isSchoolAdminRole(role)) return "Administrator";
  if (normalizeAdminRole(role) === "editor") return "Editor";
  if (normalizeAdminRole(role) === "staff") return "Staff";
  return role || "Not set";
}
