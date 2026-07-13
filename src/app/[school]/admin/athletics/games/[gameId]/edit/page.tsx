import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import GameDateTimePicker from "@/components/admin/GameDateTimePicker";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { toDateTimeLocalValue } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string; gameId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school, gameId } = await params;
  const { error: errorParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", { subdomain_input: school })
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
      .select("id, team_id, opponent, game_date, location, is_home, notes")
      .eq("id", gameId)
      .eq("school_id", schoolId)
      .single<{
        id: string;
        team_id: string | null;
        opponent: string;
        game_date: string | null;
        location: string | null;
        is_home: boolean | null;
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

    if (!teamId || !opponent) {
      redirect(`/${school}/admin/athletics/games/${gameId}/edit?error=1`);
    }

    const { error } = await supabase
      .from("games")
      .update({
        team_id: teamId,
        opponent,
        game_date: String(formData.get("game_date") || "") || null,
        location: String(formData.get("location") || "").trim() || null,
        is_home: formData.get("is_home") === "on",
        notes: String(formData.get("notes") || "").trim() || null,
      })
      .eq("id", gameId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update game error:", JSON.stringify(error, null, 2));
      redirect(`/${school}/admin/athletics/games/${gameId}/edit?error=1`);
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#181818] dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Game</h1>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this game. Please check the required fields and try again.
          </p>
        )}

        <form action={updateGame} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:shadow-none">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Team</label>
              <select name="team_id" required defaultValue={game.team_id || ""} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white">
                <option value="">Select team</option>
                {(teams || []).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Opponent</label>
              <input name="opponent" required defaultValue={game.opponent} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Game Date and Time</label>
              <GameDateTimePicker
                name="game_date"
                defaultValue={toDateTimeLocalValue(game.game_date)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Location</label>
              <input name="location" defaultValue={game.location || ""} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Notes <span className="font-normal text-slate-500 dark:text-[#a3a3a3]">(optional)</span></label>
              <textarea name="notes" rows={4} defaultValue={game.notes || ""} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 dark:border-[#3a3a3a] dark:bg-[#181818]">
              <input name="is_home" type="checkbox" defaultChecked={game.is_home ?? false} className="h-4 w-4 rounded border-[#4a4a4a]" />
              <span className="text-sm text-slate-700 dark:text-[#d4d4d4]">Home game</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#4a4a4a] dark:text-[#d4d4d4] dark:hover:bg-[#303030]">Cancel</Link>
            <button type="submit" className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90">Save Changes</button>
          </div>
        </form>
      </div>
    </main>
  );
}
