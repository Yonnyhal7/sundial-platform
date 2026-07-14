import Link from "next/link";
import {
  getSchoolAdminPath,
  getSchoolSetupPath,
  requireSuperAdminAccess,
} from "@/lib/auth/adminPermissions";
import {
  getSchoolSetupStatus,
  getSchoolSetupStatusLabel,
  type SuperAdminSchoolSummary,
} from "@/lib/schools";
import { formatShortDate } from "@/lib/formatDate";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

type School = SuperAdminSchoolSummary;

export default async function SuperAdminDashboardPage() {
  const { supabase } = await requireSuperAdminAccess();
  const schoolsHref = "/admin/dashboard/schools";
  const createSchoolHref = "/admin/dashboard/schools/new";

  const [
    { count: totalSchools },
    { count: archivedSchools },
    { data: schoolStatusRows },
    { count: totalUsers },
    { data: recentSchools },
  ] = await Promise.all([
    supabase.from("schools").select("*", { count: "exact", head: true }),
    supabase.from("schools").select("*", { count: "exact", head: true }).not("archived_at", "is", null),
    supabase
      .from("schools")
      .select("is_active, setup_complete")
      .is("archived_at", null)
      .returns<{ is_active: boolean | null; setup_complete: boolean | null }[]>(),
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase
      .from("schools")
      .select("id, name, subdomain, is_active, created_at, archived_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<School[]>(),
  ]);

  const activeSchools = (schoolStatusRows || []).filter(
    (school) => getSchoolSetupStatus(school) === "active"
  ).length;
  const setupIncomplete = (schoolStatusRows || []).length - activeSchools;
  const recentSchoolRows = await Promise.all(
    (recentSchools || []).map(async (school) => ({
      school,
      href:
        getSchoolSetupStatus(school) === "incomplete"
          ? await getSchoolSetupPath(school.subdomain)
          : await getSchoolAdminPath(school.subdomain),
    }))
  );

  const statCards = [
    { label: "Total Schools", value: totalSchools || 0 },
    { label: "Archived Schools", value: archivedSchools || 0 },
    { label: "Active Schools", value: activeSchools },
    { label: "Setup Incomplete", value: setupIncomplete },
    { label: "Total Users", value: totalUsers || 0 },
  ];

  return (
    <div className="w-full max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Sundial SuperAdmin
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-3 text-slate-500 dark:text-slate-300">
            Platform overview and tenant activity.
          </p>
        </div>

        <Link
          href={createSchoolHref}
          className={sundialPrimaryButtonClass()}
        >
          + Create School
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <article
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {card.label}
            </p>
            <p className="mt-4 text-4xl font-bold tracking-tight">
              {card.value.toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-xl font-semibold">Recent Schools</h2>
          <Link
            href={schoolsHref}
            className="text-sm font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            View all
          </Link>
        </div>
        {recentSchoolRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-semibold">School</th>
                  <th className="px-6 py-3 font-semibold">Subdomain</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {recentSchoolRows.map(({ school, href: schoolHref }) => {
                  const status = getSchoolSetupStatus(school);

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
              Create your first school tenant to start onboarding.
            </p>
            <Link
              href={createSchoolHref}
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
