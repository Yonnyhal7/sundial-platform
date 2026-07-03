import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { toDateTimeLocalValue } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function optionalNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value === "" ? null : Number(value);
}

export default async function EditGamePage({
  params,
}: {
  params: Promise<{ school: string; gameId: string }>;
}) {
  const { school, gameId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();
  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "athletics", school);

  const [{ data: teams }, { data: game }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("name", { ascending: true }),
    supabase
      .from("games")
      .select("id, team_id, opponent, game_date, location, is_home, home_score, away_score, result, notes")
      .eq("id", gameId)
      .eq("school_id", schoolId)
      .single<{
        id: string;
        team_id: string | null;
        opponent: string;
        game_date: string | null;
        location: string | null;
        is_home: boolean | null;
        home_score: number | null;
        away_score: number | null;
        result: string | null;
        notes: string | null;
      }>(),
  ]);

  if (!game) notFound();

  async function updateGame(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const teamId = String(formData.get("team_id") || "");
    const opponent = String(formData.get("opponent") || "").trim();

    if (!teamId || !opponent) return;

    const { error } = await supabase
      .from("games")
      .update({
        team_id: teamId,
        opponent,
        game_date: String(formData.get("game_date") || "") || null,
        location: String(formData.get("location") || "").trim() || null,
        is_home: formData.get("is_home") === "on",
        home_score: optionalNumber(formData, "home_score"),
        away_score: optionalNumber(formData, "away_score"),
        result: String(formData.get("result") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
      })
      .eq("id", gameId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update game error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#181818] dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Game</h1>

        <form action={updateGame} className="rounded-2xl border border-[#3a3a3a] bg-[#242424] p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Team</label>
              <select name="team_id" required defaultValue={game.team_id || ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500">
                <option value="">Select team</option>
                {(teams || []).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Opponent</label>
              <input name="opponent" required defaultValue={game.opponent} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Game Date and Time</label>
              <input name="game_date" type="datetime-local" defaultValue={toDateTimeLocalValue(game.game_date)} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Location</label>
              <input name="location" defaultValue={game.location || ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Home Score</label>
                <input name="home_score" type="number" defaultValue={game.home_score ?? ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Away Score</label>
                <input name="away_score" type="number" defaultValue={game.away_score ?? ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Result <span className="font-normal text-[#a3a3a3]">(optional)</span></label>
              <input name="result" defaultValue={game.result || ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Notes <span className="font-normal text-[#a3a3a3]">(optional)</span></label>
              <textarea name="notes" rows={4} defaultValue={game.notes || ""} className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3">
              <input name="is_home" type="checkbox" defaultChecked={game.is_home ?? false} className="h-4 w-4 rounded border-[#4a4a4a]" />
              <span className="text-sm text-[#d4d4d4]">Home game</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#3a3a3a] pt-5">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-[#4a4a4a] px-4 py-2 text-sm text-[#d4d4d4] hover:bg-[#303030]">Cancel</Link>
            <button type="submit" className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">Save Changes</button>
          </div>
        </form>
      </div>
    </main>
  );
}
