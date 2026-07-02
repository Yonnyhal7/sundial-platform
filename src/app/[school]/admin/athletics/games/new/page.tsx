import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function optionalNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value === "" ? null : Number(value);
}

export default async function NewGamePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();
  const schoolId = schoolData.id;
  const schoolName = schoolData.name;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  async function createGame(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const teamId = String(formData.get("team_id") || "");
    const opponent = String(formData.get("opponent") || "").trim();

    if (!teamId || !opponent) return;

    const { error } = await supabase.from("games").insert({
      school_id: schoolId,
      team_id: teamId,
      opponent,
      game_date: String(formData.get("game_date") || "") || null,
      location: String(formData.get("location") || "").trim() || null,
      is_home: formData.get("is_home") === "on",
      home_score: optionalNumber(formData, "home_score"),
      away_score: optionalNumber(formData, "away_score"),
      result: String(formData.get("result") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    });

    if (error) {
      console.error("Create game error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolName} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Game</h1>
        </div>

        <form action={createGame} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Team</label>
              <select name="team_id" required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500">
                <option value="">Select team</option>
                {(teams || []).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Opponent</label>
              <input name="opponent" required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Game Date and Time</label>
              <input name="game_date" type="datetime-local" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Location</label>
              <input name="location" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Home Score</label>
                <input name="home_score" type="number" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Away Score</label>
                <input name="away_score" type="number" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Result <span className="font-normal text-slate-500">(optional)</span></label>
              <input name="result" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Notes <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea name="notes" rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
              <input name="is_home" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-600" />
              <span className="text-sm text-slate-300">Home game</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">Cancel</Link>
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">Create Game</button>
          </div>
        </form>
      </div>
    </main>
  );
}
