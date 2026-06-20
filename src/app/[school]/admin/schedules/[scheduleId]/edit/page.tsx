import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ScheduleEditForm from "./schedule-edit-form";
import { updateScheduleAction } from "./actions";

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ school: string; scheduleId: string }>;
}) {
  const { school, scheduleId } = await params;
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

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, school_id, schedule_name, schedule_type, active")
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
    .order("sort_order", { ascending: true });

  const existingPeriodIds = periods?.map((period) => period.id) || [];

const updateSchedule = updateScheduleAction.bind(
  null,
  school,
  schoolId,
  scheduleId,
  existingPeriodIds
);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">Edit Schedule</h1>
          <p className="mt-2 text-sm text-slate-400">
            Update the schedule template and reorder its periods.
          </p>
        </div>

        <ScheduleEditForm
          school={school}
          schedule={schedule}
          initialPeriods={periods || []}
          action={updateSchedule}
        />
      </div>
    </main>
  );
}