import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ScheduleForm from "./schedule-form";

export default async function NewSchedulePage({
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
    const active = formData.get("active") === "on";

    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        school_id: schoolId,
        schedule_name: scheduleName,
        schedule_type: scheduleType || null,
        active,
      })
      .select("id")
      .single();

    if (scheduleError || !schedule) {
      console.error(
        "Create schedule error:",
        JSON.stringify(scheduleError, null, 2)
      );
      return;
    }

    const periodNames = formData.getAll("period_name").map(String);
    const startTimes = formData.getAll("start_time").map(String);
    const endTimes = formData.getAll("end_time").map(String);

    const periods = periodNames
      .map((name, index) => ({
        schedule_id: schedule.id,
        name,
        start_time: startTimes[index] || null,
        end_time: endTimes[index] || null,
        sort_order: index + 1,
      }))
      .filter((period) => period.name && period.start_time && period.end_time);

    if (periods.length > 0) {
      const { error: periodsError } = await supabase
        .from("periods")
        .insert(periods);

      if (periodsError) {
        console.error(
          "Create periods error:",
          JSON.stringify(periodsError, null, 2)
        );
        return;
      }
    }

    redirect(`/${school}/admin/schedules`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Schedule</h1>
          <p className="mt-2 text-sm text-slate-400">
            Create a schedule template and define all periods for the day.
          </p>
        </div>

        <ScheduleForm school={school} createSchedule={createSchedule} />
      </div>
    </main>
  );
}
