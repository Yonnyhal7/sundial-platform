import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ScheduleForm from "@/components/admin/ScheduleForm";
import { connectDetectedScheduleInDraft } from "../../calendar/wizard/actions";
import { normalizeHexColor } from "@/lib/scheduleColors";

export default async function NewSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{
    error?: string;
    name?: string;
    aiTempId?: string;
    returnTo?: string;
  }>;
}) {
  const { school } = await params;
  const { error: errorParam, name: nameParam, aiTempId, returnTo } = await searchParams;
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
  await requireAdminSectionAccess(schoolId, "schedules", school);

  async function createSchedule(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "schedules",
      school
    );

    const scheduleName = String(formData.get("schedule_name") || "");
    const scheduleType = String(formData.get("schedule_type") || "");
    const rawCalendarColor = String(formData.get("calendar_color") || "").trim();
    const calendarColor = normalizeHexColor(rawCalendarColor);
    if (rawCalendarColor && !calendarColor) {
      redirect(`/${school}/admin/schedules/new?error=1`);
    }
    const active = formData.get("active") === "on";
    const periodNames = formData.getAll("period_name").map(String);
    const startTimes = formData.getAll("start_time").map(String);
    const endTimes = formData.getAll("end_time").map(String);
    const validPeriodInputs = periodNames
      .map((name, index) => ({
        name,
        start_time: startTimes[index] || null,
        end_time: endTimes[index] || null,
        sort_order: index + 1,
      }))
      .filter((period) => period.name && period.start_time && period.end_time);

    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        school_id: schoolId,
        schedule_name: scheduleName,
        schedule_type: scheduleType || null,
        calendar_color: calendarColor,
        active,
        setup_status: validPeriodInputs.length > 0 ? "ready" : "needs_times",
      })
      .select("id")
      .single();

    if (scheduleError || !schedule) {
      console.error(
        "Create schedule error:",
        JSON.stringify(scheduleError, null, 2)
      );
      redirect(`/${school}/admin/schedules/new?error=1`);
    }

    const periods = validPeriodInputs
      .map((period) => ({
        school_id: schoolId,
        schedule_id: schedule.id,
        ...period,
      }));

    if (periods.length > 0) {
      const { error: periodsError } = await supabase
        .from("periods")
        .insert(periods);

      if (periodsError) {
        console.error(
          "Create periods error:",
          JSON.stringify(periodsError, null, 2)
        );
        redirect(`/${school}/admin/schedules/new?error=1`);
      }
    }

    const safeReturnTo = getSafeScheduleReturnPath(
      String(formData.get("return_to") || ""),
      school
    );
    const detectedTempId = String(formData.get("ai_temp_id") || "");

    if (safeReturnTo && detectedTempId) {
      const result = await connectDetectedScheduleInDraft(school, {
        tempId: detectedTempId,
        scheduleId: schedule.id,
      });

      if (result.status === "success") {
        redirect(safeReturnTo);
      }
    }

    redirect(`/${school}/admin/schedules`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Schedule</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Create a schedule template and define all periods for the day.
          </p>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this schedule. Please try again.
          </p>
        )}

        <ScheduleForm
          school={school}
          action={createSchedule}
          submitLabel="Create Schedule"
          initialScheduleName={nameParam || ""}
          hiddenFields={{
            ai_temp_id: aiTempId || "",
            return_to: returnTo || "",
          }}
        />
      </div>
    </main>
  );
}

function getSafeScheduleReturnPath(value: string, school: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  const allowedPrefixes = [
    `/${school}/admin/calendar/wizard`,
    `/admin/${school}/calendar/wizard`,
    `/${school}/dashboard/calendar/wizard`,
  ];

  return allowedPrefixes.some(
    (prefix) =>
      value === prefix ||
      value.startsWith(`${prefix}?`) ||
      value.startsWith(`${prefix}/`)
  )
    ? value
    : null;
}
