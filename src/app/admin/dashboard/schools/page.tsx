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
import { normalizeDeletionCounts } from "@/lib/schoolLifecycle";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";
import SchoolLifecycleDialog from "./SchoolLifecycleDialog";
import { retrySchoolStorageCleanupAction } from "./lifecycle-actions";
import ResendSetupEmailButton from "./ResendSetupEmailButton";
import CreatedSchoolNotice from "./CreatedSchoolNotice";

type SchoolsPageProps = {
  searchParams: Promise<{
    created?: string;
    subdomain?: string;
    inviteDelivery?: string;
  }>;
};

type SetupInvitation = {
  id: string;
  school_id: string;
  email: string;
  delivery_status: "pending" | "sending" | "sent" | "failed";
  sent_at: string | null;
  delivery_attempt_count: number;
  delivery_failure_reason: string | null;
  expires_at: string;
  created_at: string;
};

type School = SuperAdminSchoolSummary;

export default async function SchoolsPage({ searchParams }: SchoolsPageProps) {
  const { supabase } = await requireSuperAdminAccess();
  const { created, subdomain, inviteDelivery } = await searchParams;
  const schoolsHref = "/admin/dashboard/schools";

  const [{ data: schools }, { data: cleanupJobs }] = await Promise.all([
    supabase
      .from("schools")
      .select("id, name, subdomain, is_active, created_at, archived_at, archived_by")
      .order("created_at", { ascending: false })
      .returns<School[]>(),
    supabase
      .from("school_storage_cleanup_jobs")
      .select("id, deleted_school_name, deleted_school_subdomain, status, attempts, last_error, updated_at")
      .in("status", ["database_deleted", "storage_failed"])
      .order("updated_at", { ascending: false })
      .returns<{
        id: string;
        deleted_school_name: string;
        deleted_school_subdomain: string;
        status: string;
        attempts: number;
        last_error: string | null;
        updated_at: string;
      }[]>(),
  ]);

  const activeSchools = (schools || []).filter((school) => !school.archived_at);
  const archivedSchools = (schools || []).filter((school) => school.archived_at);
  const { data: setupInvitations } = activeSchools.length
    ? await supabase
        .from("pending_admin_invites")
        .select("id, school_id, email, delivery_status, sent_at, delivery_attempt_count, delivery_failure_reason, expires_at, created_at")
        .in("school_id", activeSchools.map((school) => school.id))
        .or("role.eq.school_admin,role.is.null")
        .not("created_by", "is", null)
        .order("created_at", { ascending: false })
        .returns<SetupInvitation[]>()
    : { data: [] as SetupInvitation[] };
  const latestInvitationBySchool = new Map<string, SetupInvitation>();
  for (const invitation of setupInvitations || []) {
    if (!latestInvitationBySchool.has(invitation.school_id)) {
      latestInvitationBySchool.set(invitation.school_id, invitation);
    }
  }
  const activeRows = await Promise.all(
    activeSchools.map(async (school) => ({
      school,
      href:
        getSchoolSetupStatus(school) === "incomplete"
          ? await getSchoolSetupPath(school.subdomain)
          : await getSchoolAdminPath(school.subdomain),
      invitation: latestInvitationBySchool.get(school.id),
    }))
  );
  const archivedRows = await Promise.all(
    archivedSchools.map(async (school) => {
      const { data } = await supabase.rpc("get_archived_school_deletion_summary", {
        p_school_id: school.id,
      });
      const result = data as { counts?: unknown } | null;
      return { school, counts: normalizeDeletionCounts(result?.counts) };
    })
  );

  return (
    <div className="w-full max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Sundial SuperAdmin</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Schools</h1>
        </div>
        <Link href={`${schoolsHref}/new`} className={sundialPrimaryButtonClass()}>+ Create School</Link>
      </div>

      {created && (
        <CreatedSchoolNotice
          created={created}
          subdomain={subdomain}
          inviteDelivery={inviteDelivery}
          adminUrl={process.env.SUNDIAL_ADMIN_URL || "http://localhost:3000/admin"}
        />
      )}

      <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700"><h2 className="text-xl font-bold">Active schools</h2></div>
        {activeRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-6 py-3">School</th><th className="px-6 py-3">Subdomain</th><th className="px-6 py-3">Setup</th><th className="px-6 py-3">Created</th><th className="px-6 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeRows.map(({ school, href, invitation }) => {
                  const status = getSchoolSetupStatus(school);
                  return <tr key={school.id}>
                    <td className="px-6 py-4 font-bold">{school.name}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300">{school.subdomain}</td>
                    <td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold dark:bg-slate-800">{getSchoolSetupStatusLabel(status)}</span>{invitation && <div className="mt-2"><p className="text-xs text-slate-500">Setup email: <span className="font-bold capitalize">{invitation.delivery_status}</span> · {invitation.email}</p>{invitation.delivery_status === "failed" && invitation.delivery_failure_reason && <p className="mt-1 max-w-xs text-xs text-amber-700 dark:text-amber-300">{invitation.delivery_failure_reason}</p>}{(invitation.delivery_status === "pending" || invitation.delivery_status === "failed") && <ResendSetupEmailButton inviteId={invitation.id} schoolId={school.id} initialExpiresAt={invitation.expires_at} />}</div>}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-300">{formatShortDate(school.created_at)}</td>
                    <td className="px-6 py-4"><div className="flex items-center gap-3"><Link href={href} className="font-bold text-blue-600 hover:text-blue-500 dark:text-blue-400">Open Dashboard</Link><SchoolLifecycleDialog mode="archive" school={school} /></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="px-6 py-10"><p className="font-semibold">No active schools.</p></div>}
      </section>

      <section className="mt-8 overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm dark:border-amber-900 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-900 dark:bg-amber-950/20"><h2 className="text-xl font-bold">Archived schools</h2><span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-100">{archivedRows.length}</span></div>
        {archivedRows.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {archivedRows.map(({ school, counts }) => <article key={school.id} className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{school.name}</h3><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Archived</span></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{school.subdomain} · Archived {formatShortDate(school.archived_at)}</p></div>
              <div className="flex flex-wrap gap-3"><SchoolLifecycleDialog mode="restore" school={school} /><SchoolLifecycleDialog mode="delete" school={school} counts={counts} /></div>
            </div>
          </article>)}
        </div> : <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">No archived schools.</p>}
      </section>

      {!!cleanupJobs?.length && <section className="mt-8 rounded-xl border border-red-300 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/20">
        <h2 className="text-lg font-bold text-red-900 dark:text-red-100">Storage cleanup requires attention</h2>
        <p className="mt-1 text-sm text-red-800 dark:text-red-200">The database deletion completed. These tenant-scoped file manifests remain independently retryable.</p>
        <div className="mt-4 space-y-3">{cleanupJobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 dark:bg-slate-900"><div><p className="font-bold">{job.deleted_school_name} ({job.deleted_school_subdomain})</p><p className="text-xs text-slate-500">Attempts: {job.attempts}{job.last_error ? ` · ${job.last_error}` : ""}</p></div><form action={retrySchoolStorageCleanupAction}><input type="hidden" name="jobId" value={job.id} /><button className="cursor-pointer rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-600">Retry cleanup</button></form></div>)}</div>
      </section>}
    </div>
  );
}
