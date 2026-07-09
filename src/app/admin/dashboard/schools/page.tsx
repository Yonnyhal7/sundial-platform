import Link from "next/link";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import {
  getSchoolSetupStatus,
  getSchoolSetupStatusLabel,
  type SuperAdminSchoolSummary,
} from "@/lib/schools";
import { formatShortDate } from "@/lib/formatDate";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

type SchoolsPageProps = {
  searchParams: Promise<{ created?: string; subdomain?: string }>;
};

type School = SuperAdminSchoolSummary;

export default async function SchoolsPage({ searchParams }: SchoolsPageProps) {
  const { supabase } = await requireSuperAdminAccess();
  const { created, subdomain } = await searchParams;
  const schoolsHref = "/admin/dashboard/schools";

  const { data: schools } = await supabase
    .from("schools")
    .select("id, name, subdomain, is_active, created_at")
    .order("created_at", { ascending: false })
    .returns<School[]>();

  return (
    <div className="w-full max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Sundial SuperAdmin
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Schools</h1>
        </div>

        <Link
          href={`${schoolsHref}/new`}
          className={sundialPrimaryButtonClass()}
        >
          + Create School
        </Link>
      </div>

      {created && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-semibold">
            {created} was created and marked setup incomplete.
          </p>
          {subdomain && (
            <div className="mt-2 space-y-1 font-mono text-xs">
              <p>{subdomain}.sundialk12.com</p>
              <p>admin.sundialk12.com/{subdomain}</p>
            </div>
          )}
        </div>
      )}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {schools?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-semibold">School Name</th>
                  <th className="px-6 py-3 font-semibold">Subdomain</th>
                  <th className="px-6 py-3 font-semibold">Setup Status</th>
                  <th className="px-6 py-3 font-semibold">Created</th>
                  <th className="px-6 py-3 font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {schools.map((school) => {
                  const status = getSchoolSetupStatus(school);
                  const schoolHref = `/admin/${school.subdomain}`;

                  return (
                    <tr
                      key={school.id}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    >
                      <td className="p-0 font-medium">
                        <Link href={schoolHref} className="block px-6 py-4">
                          {school.name}
                        </Link>
                      </td>
                      <td className="p-0 text-slate-500 dark:text-slate-300">
                        <Link href={schoolHref} className="block px-6 py-4">
                          {school.subdomain}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={schoolHref} className="block px-6 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {getSchoolSetupStatusLabel(status)}
                          </span>
                        </Link>
                      </td>
                      <td className="p-0 text-slate-500 dark:text-slate-300">
                        <Link href={schoolHref} className="block px-6 py-4">
                          {formatShortDate(school.created_at)}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          href={schoolHref}
                          className="block px-6 py-4 text-sm font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
                        >
                          Open Dashboard →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10">
            <p className="text-base font-semibold">No schools yet</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Create a school tenant to begin setup and invite its administrator.
            </p>
            <Link
              href={`${schoolsHref}/new`}
              className={sundialPrimaryButtonClass("mt-5")}
            >
              + Create School
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
