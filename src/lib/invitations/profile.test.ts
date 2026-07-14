import { describe, expect, it } from "vitest";
import { buildSchoolAdminProfileInsert } from "./profile";

const LIVE_PUBLIC_USERS_CONTRACT = {
  requiredColumns: ["id", "full_name", "email", "role"],
  allowedRoles: ["SuperAdmin", "SchoolAdmin", "Editor"],
  roleConstraint: "users_role_check",
} as const;

function validateAgainstLiveUsersContract(row: Record<string, unknown>) {
  for (const column of LIVE_PUBLIC_USERS_CONTRACT.requiredColumns) {
    if (row[column] === null || row[column] === undefined) {
      return { code: "23502", column };
    }
  }

  if (!LIVE_PUBLIC_USERS_CONTRACT.allowedRoles.includes(row.role as never)) {
    return { code: "23514", constraint: LIVE_PUBLIC_USERS_CONTRACT.roleConstraint };
  }

  return null;
}

describe("school setup administrator profile insert", () => {
  const input = {
    authUserId: "11111111-1111-4111-8111-111111111111",
    schoolId: "22222222-2222-4222-8222-222222222222",
    email: "administrator@example.test",
    fullName: "Avery Admin",
    firstName: "Avery",
    lastName: "Admin",
  };

  it("reproduces the live role-constraint failure for the legacy payload", () => {
    const profile = { ...buildSchoolAdminProfileInsert(input), role: "school_admin" };
    expect(validateAgainstLiveUsersContract(profile)).toEqual({
      code: "23514",
      constraint: "users_role_check",
    });
  });

  it("satisfies the live required-column and role contract", () => {
    const profile = buildSchoolAdminProfileInsert(input);
    expect(profile).toMatchObject({
      id: input.authUserId,
      school_id: input.schoolId,
      email: input.email,
      full_name: input.fullName,
      role: "SchoolAdmin",
      is_active: true,
    });
    expect(validateAgainstLiveUsersContract(profile)).toBeNull();
  });
});
