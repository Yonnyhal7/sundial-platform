import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CalendarClient from "./calendar-client";
import {revalidatePath} from "next/cache";

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

  const { data: periods, error: periodsError } = await supabase
    .from("periods")
    .select("id, schedule_id, name, start_time, end_time, sort_order")
    .order("sort_order", { ascending: true });

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
        schedule_id: scheduleId || null,
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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Calendar</h1>
            <p className="mt-2 text-sm text-slate-400">
              Assign schedule templates to specific school days.
            </p>
          </div>

        </div>

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
