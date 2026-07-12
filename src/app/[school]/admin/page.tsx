import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSchoolAdminPath, getSchoolSetupStepPath, requireAdminPortalAccess } from "@/lib/auth/adminPermissions";
import { ADMIN_TAB_ICONS } from "@/components/admin/AdminNavIcons";
import { notFound, redirect } from "next/navigation";
import { getSchoolForSetup, isSchoolSetupComplete } from "@/lib/schools";
import { normalizeSetupStep } from "@/lib/setupSteps";
import { addDaysToLocalDateString, formatDateInTimeZone } from "@/lib/localDate";

function QuickActionIcon({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--school-primary)_14%,white)] text-[var(--school-primary)] dark:bg-[color:color-mix(in_srgb,var(--school-primary)_24%,#242424)]">
      <Icon className="h-7 w-7" />
    </span>
  );
}

export default async function SchoolAdminPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  const adminUser = await requireAdminPortalAccess(schoolData.id, school);

  if (!(await isSchoolSetupComplete(supabase, schoolData.id))) {
    redirect(
      await getSchoolSetupStepPath(school, normalizeSetupStep(schoolData.setup_step))
    );
  }

  const firstName = adminUser.profile.first_name?.trim() || "Admin";
  const canAccess = (permissionKey: string) =>
    adminUser.permissionKeys.includes(permissionKey as never);
  const AnnouncementsIcon = ADMIN_TAB_ICONS.announcements;
  const EventsIcon = ADMIN_TAB_ICONS.events;
  const SchedulesIcon = ADMIN_TAB_ICONS.schedules;
  const announcementsNewHref = `${await getSchoolAdminPath(school)}/announcements/new`;
  const eventsNewHref = `${await getSchoolAdminPath(school)}/events/new`;
  const schedulesHref = `${await getSchoolAdminPath(school)}/schedules`;

  const now = new Date();
  const today = formatDateInTimeZone(now, schoolData.timezone);
  const weekEndString = addDaysToLocalDateString(today, 6);

  const { data: calendarDay } = await supabase
    .from("calendar_days")
    .select("schedule_id, label, is_school_day")
    .eq("school_id", schoolData.id)
    .eq("date", today)
    .maybeSingle<{
      schedule_id: string | null;
      label: string | null;
      is_school_day: boolean | null;
    }>();

  const { data: todaySchedule } = calendarDay?.schedule_id
    ? await supabase
        .from("schedules")
        .select("schedule_name, schedule_type")
        .eq("id", calendarDay.schedule_id)
        .eq("school_id", schoolData.id)
        .maybeSingle<{ schedule_name: string; schedule_type: string | null }>()
    : { data: null };

  const [{ count: studentsCount }, { count: eventsCount }, { count: announcementsCount }] =
    await Promise.all([
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolData.id)
        .eq("is_active", true),
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolData.id)
        .eq("is_active", true)
        .gte("event_date", today)
        .lte("event_date", weekEndString),
      supabase
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolData.id),
    ]);

  const todayName = calendarDay?.is_school_day === false
    ? "No School"
    : todaySchedule?.schedule_name || calendarDay?.label || "No Schedule Assigned";

  const statCards = [
    {
      eyebrow: "Today is",
      value: todayName.toUpperCase(),
      footer: "",
      featured: true,
    },
    {
      eyebrow: "Students",
      value: (studentsCount || 0).toLocaleString(),
      footer: "Active Users",
    },
    {
      eyebrow: "Upcoming Events",
      value: String(eventsCount || 0),
      footer: "This Week",
    },
    {
      eyebrow: "Announcements",
      value: String(announcementsCount || 0),
      footer: "Active",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-black dark:text-slate-100 lg:p-10">
      <div className="w-full max-w-[96rem]">
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Welcome back, {firstName}!</h2>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
            Here&apos;s what&apos;s happening today.
          </p>

          <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6">
            {statCards.map((card) => (
              <article
                key={card.eyebrow}
                className={[
                  "min-h-40 rounded-2xl border border-slate-200 p-8 shadow-sm dark:border-slate-700",
                  card.featured
                    ? "bg-[var(--school-primary)] text-[var(--school-primary-text)]"
                    : "bg-white dark:bg-[#242424]",
                ].join(" ")}
              >
                <p className={card.featured ? "text-base font-medium opacity-85" : "text-base font-medium text-slate-900 dark:text-slate-100"}>
                  {card.eyebrow}
                </p>
                <p className={card.featured ? "mt-7 text-4xl font-bold tracking-tight" : "mt-7 text-4xl font-bold tracking-tight text-[var(--school-primary)] dark:text-slate-100"}>
                  {card.value}
                </p>
                {card.footer && (
                  <p className={card.featured ? "mt-5 text-base opacity-85" : "mt-5 text-base text-slate-500 dark:text-slate-300"}>
                    {card.footer}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Quick Actions</h2>
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-5">
            {canAccess("announcements") && (
              <Link
                href={announcementsNewHref}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--school-primary)] hover:shadow-md dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <QuickActionIcon icon={AnnouncementsIcon} />
                <span className="text-base font-medium">Create Announcement</span>
              </Link>
            )}

            {canAccess("events") && (
              <Link
                href={eventsNewHref}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--school-primary)] hover:shadow-md dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <QuickActionIcon icon={EventsIcon} />
                <span className="text-base font-medium">Add Event</span>
              </Link>
            )}

            {canAccess("schedules") && (
              <Link
                href={schedulesHref}
                className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--school-primary)] hover:shadow-md dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <QuickActionIcon icon={SchedulesIcon} />
                <span className="text-base font-medium">Manage Schedules</span>
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
