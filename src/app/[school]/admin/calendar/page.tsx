import { notFound } from "next/navigation";
import {
  getSchoolAdminPath,
  requireAdminSectionAccess,
} from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CalendarClient from "./calendar-client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { loadCalendarWizardDraft } from "./wizard/actions";
import {
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  summarizeCalendarWizardDraft,
  type CalendarWizardDraftRecord,
} from "@/lib/calendarWizard/draftPersistence";

export default async function AdminCalendarPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "calendar", school);
  const calendarWizardHref = `${await getSchoolAdminPath(school)}/calendar/wizard`;
  const [aiDraftResult, guidedDraftResult] = await Promise.all([
    loadCalendarWizardDraft(school, AI_CALENDAR_WIZARD_DRAFT_TYPE),
    loadCalendarWizardDraft(school, GUIDED_CALENDAR_WIZARD_DRAFT_TYPE),
  ]);
  const aiDraft =
    aiDraftResult.status === "success" && aiDraftResult.draft ? aiDraftResult.draft : null;
  const guidedDraft =
    guidedDraftResult.status === "success" && guidedDraftResult.draft
      ? guidedDraftResult.draft
      : null;
  const draftCards = [
    aiDraft
      ? {
          key: "ai",
          title: "Continue AI Calendar Import",
          href: `${calendarWizardHref}/ai`,
          draft: aiDraft,
          summary: summarizeCalendarWizardDraft(aiDraft.wizard_data),
          detailLabel: "schedules still need bell times",
        }
      : null,
    guidedDraft
      ? {
          key: "guided",
          title: "Continue Guided Setup",
          href: `${calendarWizardHref}/guided`,
          draft: guidedDraft,
          summary: summarizeCalendarWizardDraft(guidedDraft.wizard_data),
          detailLabel: "current step",
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    href: string;
    draft: CalendarWizardDraftRecord;
    summary: ReturnType<typeof summarizeCalendarWizardDraft>;
    detailLabel: string;
  }>;

  const { data: schedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("id, schedule_name, schedule_type, active")
    .eq("school_id", schoolId)
    .eq("active", true)
    .order("schedule_name", { ascending: true });

  if (schedulesError) {
    console.error("Calendar schedules error:", JSON.stringify(schedulesError, null, 2));
  }

  const { data: calendarDays, error: calendarError } = await supabase
    .from("calendar_days")
    .select("id, date, schedule_id, label, is_school_day")
    .eq("school_id", schoolId);

  if (calendarError) {
    console.error("Calendar days error:", JSON.stringify(calendarError, null, 2));
  }

  const scheduleIds = (schedules || []).map((schedule) => schedule.id);

  const { data: periods, error: periodsError } = scheduleIds.length
    ? await supabase
        .from("periods")
        .select("id, schedule_id, name, start_time, end_time, sort_order")
        .in("schedule_id", scheduleIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

    if (periodsError) {
    console.error("Calendar periods error:", JSON.stringify(periodsError, null, 2));
    }

  async function saveCalendarDay(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "calendar",
      school
    );

    const date = String(formData.get("date") || "");
    const scheduleId = String(formData.get("schedule_id") || "");
    const label = String(formData.get("label") || "");
    const isSchoolDay = formData.get("is_school_day") === "on";

    if (!date) return;

    const { error } = await supabase.from("calendar_days").upsert(
      {
        school_id: schoolId,
        date,
        schedule_id: isSchoolDay ? scheduleId || null : null,
        base_schedule_id: isSchoolDay ? scheduleId || null : null,
        label: label || null,
        is_school_day: isSchoolDay,
      },
      {
        onConflict: "school_id,date",
      }
    );

    if (error) {
        console.error("Save calendar day error:", JSON.stringify(error, null, 2));
        return;
    }

    revalidatePath(`/${school}/admin/calendar`);
  }

  return (
    <main className="calendar-admin-page min-h-screen bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Calendar</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Assign schedule templates to specific school days.
            </p>
          </div>

          <Link
            href={calendarWizardHref}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--school-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--school-primary-text)] shadow-sm transition hover:opacity-90"
          >
            Create School-Year Calendar
          </Link>
        </div>

        {draftCards.length > 0 && (
          <section className="mb-8 grid gap-4 lg:grid-cols-2">
            {draftCards.map((card) => (
              <div
                key={card.key}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#9A7209] dark:text-[#F6C64A]">
                  Saved Progress
                </p>
                <h2 className="mt-2 text-2xl font-bold">{card.title}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {card.summary.schoolYearLabel || "School-Year Calendar Draft"} ·{" "}
                  {card.summary.completionPercentage}% complete · Last updated{" "}
                  {new Date(card.draft.updated_at).toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {card.key === "ai"
                    ? `${card.summary.remainingScheduleCount} ${
                        card.summary.remainingScheduleCount === 1 ? "schedule" : "schedules"
                      } still need bell times`
                    : `Current step: ${card.draft.wizard_data.currentStep.replaceAll("-", " ")}`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={card.href}
                    className="inline-flex items-center justify-center rounded-lg bg-[var(--school-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--school-primary-text)] shadow-sm transition hover:opacity-90"
                  >
                    Resume
                  </Link>
                  <Link
                    href={`${card.href}?startOver=1`}
                    className="inline-flex items-center justify-center rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40"
                  >
                    Start Over
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        <CalendarClient
          schedules={schedules || []}
          calendarDays={calendarDays || []}
          periods={periods || []}
          action={saveCalendarDay}
        />
      </div>
    </main>
  );
}
