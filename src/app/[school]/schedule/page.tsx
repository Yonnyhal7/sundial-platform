import { createSupabaseServerClient } from "@/lib/supabase/server";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
};

export default async function SchedulePage({
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
    .single<{ id: string }>();

  if (!schoolData) return null;

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, name")
    .eq("school_id", schoolData.id)
    .eq("is_default", true)
    .single<{ id: string; name: string }>();

  if (!schedule) {
    return (
      <main className="p-8">
        <h1 className="text-4xl font-bold">Schedule</h1>
        <p className="mt-4 text-neutral-400">No active schedule found.</p>
      </main>
    );
  }

  const { data: periods } = await supabase
    .from("periods")
    .select("id, name, start_time, end_time, sort_order")
    .eq("schedule_id", schedule.id)
    .order("sort_order", { ascending: true });

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold">{schedule.name}</h1>

      <div className="mt-8 space-y-4">
        {periods?.map((period: Period) => (
          <div
            key={period.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">{period.name}</h2>
              <p className="text-neutral-300">
                {period.start_time} - {period.end_time}
              </p>
            </div>
          </div>
        ))}

        {!periods?.length && (
          <p className="text-neutral-400">No periods available.</p>
        )}
      </div>
    </main>
  );
}