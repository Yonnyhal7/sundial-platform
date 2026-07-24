export const SCHOOL_ADMIN_DATABASE_ROLE = "SchoolAdmin" as const;

export function buildSchoolAdminProfileInsert({
  authUserId,
  schoolId,
  email,
  fullName,
  firstName,
  lastName,
  role = SCHOOL_ADMIN_DATABASE_ROLE,
}: {
  authUserId: string;
  schoolId: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  role?: "SchoolAdmin" | "Editor";
}) {
  return {
    id: authUserId,
    school_id: schoolId,
    email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    role,
    is_active: true,
  };
}
