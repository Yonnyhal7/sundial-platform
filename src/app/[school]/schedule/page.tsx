import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
        schedule_type
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
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name}</p>
          <h1 className="mt-1 text-3xl font-bold">Today&apos;s Schedule</h1>
          <p className="mt-2 text-sm text-slate-400">
            {new Date(`${today}T00:00:00`).toLocaleDateString()}
          </p>
        </div>

        {!calendarDay ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold">No schedule posted</h2>
            <p className="mt-2 text-sm text-slate-400">
              No schedule has been assigned for today yet.
            </p>
          </section>
        ) : calendarDay.is_school_day === false ? (
          <section className="rounded-2xl border border-red-900/60 bg-red-950/30 p-8 text-center">
            <h2 className="text-xl font-semibold text-red-200">No School Today</h2>
            {calendarDay.label && (
              <p className="mt-2 text-sm text-red-100">{calendarDay.label}</p>
            )}
          </section>
        ) : !schedule ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold">No schedule selected</h2>
            <p className="mt-2 text-sm text-slate-400">
              This day is marked as a school day, but no schedule is assigned.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-6 border-b border-slate-800 pb-5">
              <h2 className="text-2xl font-bold">{schedule.schedule_name}</h2>

              {schedule.schedule_type && (
                <p className="mt-1 text-sm text-slate-400">
                  {schedule.schedule_type}
                </p>
              )}

              {calendarDay.label && (
                <p className="mt-3 rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
                  {calendarDay.label}
                </p>
              )}
            </div>

            {!periods || periods.length === 0 ? (
              <p className="text-sm text-slate-400">
                No periods have been added to this schedule yet.
              </p>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => (
                  <div
                    key={period.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-100">
                        {period.name}
                      </p>
                    </div>

                    <p className="text-sm text-slate-300">
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