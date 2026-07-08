import Link from "next/link";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import CreateSchoolForm from "./create-school-form";

export default async function NewSchoolPage() {
  await requireSuperAdminAccess();
  const schoolsHref = "/admin/dashboard/schools";

  return (
    <div className="w-full max-w-7xl">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        Sundial SuperAdmin
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Create School</h1>
      <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-300">
        Start a school tenant with only its name. Sundial will create the
        internal subdomain and leave setup marked incomplete.
      </p>

      <CreateSchoolForm schoolsHref={schoolsHref} />

      <div className="mt-6">
        <Link
          href={schoolsHref}
          className="text-sm font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          Back to schools
        </Link>
      </div>
    </div>
  );
}
