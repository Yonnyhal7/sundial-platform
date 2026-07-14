export const SCHOOL_ADMIN_DATABASE_ROLE = "SchoolAdmin" as const;

export function buildSchoolAdminProfileInsert({
  authUserId,
  schoolId,
  email,
  fullName,
  firstName,
  lastName,
}: {
  authUserId: string;
  schoolId: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
}) {
  return {
    id: authUserId,
    school_id: schoolId,
    email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    role: SCHOOL_ADMIN_DATABASE_ROLE,
    is_active: true,
  };
}
