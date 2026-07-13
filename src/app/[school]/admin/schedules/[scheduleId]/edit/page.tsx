import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ScheduleForm from "@/components/admin/ScheduleForm";
import { updateScheduleAction } from "./actions";

export default async function EditSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string; scheduleId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school, scheduleId } = await params;
  const { error: errorParam } = await searchParams;
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

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, school_id, schedule_name, schedule_type, calendar_color, active")
    .eq("id", scheduleId)
    .eq("school_id", schoolId)
    .single();

  if (!schedule) {
    notFound();
  }

  const { data: periods } = await supabase
    .from("periods")
    .select("id, name, start_time, end_time, sort_order")
    .eq("schedule_id", scheduleId)
    .eq("school_id", schoolId)
    .order("sort_order", { ascending: true });

const updateSchedule = updateScheduleAction.bind(
  null,
  school,
  schoolId,
  scheduleId
);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">Edit Schedule</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Update the schedule template and reorder its periods.
          </p>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this schedule. Please try again.
          </p>
        )}

        <ScheduleForm
          school={school}
          action={updateSchedule}
          submitLabel="Save Changes"
          initialScheduleName={schedule.schedule_name}
          initialScheduleType={schedule.schedule_type || ""}
          initialCalendarColor={schedule.calendar_color || ""}
          initialActive={schedule.active}
          initialPeriods={periods || []}
        />
      </div>
    </main>
  );
}
