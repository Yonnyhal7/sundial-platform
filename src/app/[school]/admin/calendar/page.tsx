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
import {
  clearCalendarDayAction,
  deleteSavedCalendarProgressAction,
} from "./actions";
import SavedProgressCards, {
  type SavedProgressCard,
} from "./saved-progress-cards";

export default async function AdminCalendarPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", {
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
    aiDraftResult.status === "success" && aiDraftResult.draft
      ? aiDraftResult.draft
      : null;
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
        }
      : null,
    guidedDraft
      ? {
          key: "guided",
          title: "Continue Guided Setup",
          href: `${calendarWizardHref}/guided`,
          draft: guidedDraft,
          summary: summarizeCalendarWizardDraft(guidedDraft.wizard_data),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    href: string;
    draft: CalendarWizardDraftRecord;
    summary: ReturnType<typeof summarizeCalendarWizardDraft>;
  }>;
  const savedProgressCards: SavedProgressCard[] = draftCards.map((card) => ({
    key: card.key,
    title: card.title,
    href: card.href,
    draftId: card.draft.id,
    schoolYearLabel: card.draft.school_year_label,
    updatedAt: card.draft.updated_at,
    completionPercentage: card.summary.completionPercentage,
    detail:
      card.key === "ai"
        ? `${card.summary.remainingScheduleCount} ${card.summary.remainingScheduleCount === 1 ? "schedule" : "schedules"} still need bell times`
        : `Current step: ${card.draft.wizard_data.currentStep.replaceAll("-", " ")}`,
  }));
  const deleteSavedProgress = deleteSavedCalendarProgressAction.bind(
    null,
    school,
  );

  const { data: schedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("id, schedule_name, schedule_type, calendar_color, active")
    .eq("school_id", schoolId)
    .eq("active", true)
    .order("schedule_name", { ascending: true });

  if (schedulesError) {
    console.error(
      "Calendar schedules error:",
      JSON.stringify(schedulesError, null, 2),
    );
  }

  const { data: calendarDays, error: calendarError } = await supabase
    .from("calendar_days")
    .select("id, date, schedule_id, label, is_school_day")
    .eq("school_id", schoolId);

  if (calendarError) {
    console.error(
      "Calendar days error:",
      JSON.stringify(calendarError, null, 2),
    );
  }

  const scheduleIds = (schedules || []).map((schedule) => schedule.id);

  const { data: periods, error: periodsError } = scheduleIds.length
    ? await supabase
        .from("periods")
        .select("id, schedule_id, name, start_time, end_time, sort_order")
        .eq("school_id", schoolId)
        .in("schedule_id", scheduleIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (periodsError) {
    console.error(
      "Calendar periods error:",
      JSON.stringify(periodsError, null, 2),
    );
  }

  async function saveCalendarDay(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "calendar",
      school,
    );

    const date = String(formData.get("date") || "");
    const scheduleId = String(formData.get("schedule_id") || "");
    const label = String(formData.get("label") || "");
    const isSchoolDay = formData.get("is_school_day") === "on";

    if (!date) return;

    if (isSchoolDay && scheduleId) {
      const { data: ownedSchedule } = await supabase
        .from("schedules")
        .select("id")
        .eq("id", scheduleId)
        .eq("school_id", schoolId)
        .eq("active", true)
        .maybeSingle<{ id: string }>();

      if (!ownedSchedule) {
        console.warn(
          "Rejected calendar assignment to an unavailable schedule",
          {
            schoolId,
            scheduleId,
          },
        );
        return;
      }
    }

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
      },
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {schoolData.name} Admin
            </p>
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

        <SavedProgressCards
          initialCards={savedProgressCards}
          deleteAction={deleteSavedProgress}
        />

        <CalendarClient
          schedules={schedules || []}
          calendarDays={calendarDays || []}
          periods={periods || []}
          action={saveCalendarDay}
          clearAction={clearCalendarDayAction.bind(null, school)}
        />
      </div>
    </main>
  );
}
