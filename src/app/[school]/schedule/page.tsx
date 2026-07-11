import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScheduleCalendarColor, getScheduleDotStyle } from "@/lib/scheduleColors";

function getTodayLocalDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(time: string) {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SchoolSchedulePage({
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

  const today = getTodayLocalDate();

  const { data: calendarDay, error: calendarError } = await supabase
    .from("calendar_days")
    .select(
      `
      id,
      date,
      label,
      is_school_day,
      schedule:schedules (
        id,
        schedule_name,
        schedule_type,
        calendar_color,
        setup_status
      )
    `
    )
    .eq("school_id", schoolData.id)
    .eq("date", today)
    .maybeSingle();

  if (calendarError) {
    console.error("Public schedule calendar error:", JSON.stringify(calendarError, null, 2));
  }

  const schedule = Array.isArray(calendarDay?.schedule)
    ? calendarDay?.schedule[0]
    : calendarDay?.schedule;
  const scheduleColor = schedule ? getScheduleCalendarColor(schedule) : null;

  const { data: periods, error: periodsError } =
    schedule?.id
      ? await supabase
          .from("periods")
          .select("id, name, start_time, end_time, sort_order")
          .eq("schedule_id", schedule.id)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

  if (periodsError) {
    console.error("Public schedule periods error:", JSON.stringify(periodsError, null, 2));
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-600 dark:text-[#a3a3a3]">{schoolData.name}</p>
          <h1 className="mt-1 text-3xl font-bold">Today&apos;s Schedule</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-[#a3a3a3]">
            {new Date(`${today}T00:00:00`).toLocaleDateString()}
          </p>
        </div>

        {!calendarDay ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h2 className="text-xl font-semibold">No schedule posted</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-[#a3a3a3]">
              No schedule has been assigned for today yet.
            </p>
          </section>
        ) : calendarDay.is_school_day === false ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm dark:border-rose-500/30 dark:bg-rose-500/20">
            <h2 className="text-xl font-semibold text-rose-700 dark:text-rose-200">No School Today</h2>
            {calendarDay.label && (
              <p className="mt-2 text-sm text-rose-700 dark:text-rose-100">{calendarDay.label}</p>
            )}
          </section>
        ) : !schedule ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h2 className="text-xl font-semibold">No schedule selected</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-[#a3a3a3]">
              This day is marked as a school day, but no schedule is assigned.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <div className="mb-6 border-b border-slate-200 pb-5 dark:border-[#3a3a3a]">
              <div className="flex items-center gap-3">
                {scheduleColor && (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border"
                    style={getScheduleDotStyle(scheduleColor)}
                    aria-label={`${schedule.schedule_name} calendar color`}
                    role="img"
                  />
                )}
                <h2 className="text-2xl font-bold">{schedule.schedule_name}</h2>
              </div>

              {schedule.schedule_type && (
                <p className="mt-1 text-sm text-slate-600 dark:text-[#a3a3a3]">
                  {schedule.schedule_type}
                </p>
              )}

              {calendarDay.label && (
                <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-200">
                  {calendarDay.label}
                </p>
              )}
            </div>

            {schedule.setup_status === "needs_times" ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600 dark:bg-[#181818] dark:text-[#a3a3a3]">
                Bell times have not been added yet.
              </div>
            ) : !periods || periods.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-[#a3a3a3]">
                No periods have been added to this schedule yet.
              </p>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => (
                  <div
                    key={period.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-[#3a3a3a] dark:bg-[#181818]"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {period.name}
                      </p>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-[#d4d4d4]">
                      {formatTime(period.start_time)} - {formatTime(period.end_time)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
