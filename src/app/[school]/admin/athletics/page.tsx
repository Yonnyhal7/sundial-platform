import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import SportIcon from "@/components/SportIcon";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { formatGameDateTime } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Sport = {
  id: string;
  name: string;
  icon: string | null;
  icon_color: string | null;
  season: string | null;
  is_active: boolean | null;
};

type Team = {
  id: string;
  sport_id: string | null;
  name: string;
  level: string | null;
  gender: string | null;
  coach_name: string | null;
  coach_email: string | null;
  is_active: boolean | null;
};

type Game = {
  id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
  notes: string | null;
};

const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:shadow-none";
const innerCardClass =
  "rounded-2xl border border-slate-200 bg-slate-100 dark:border-[#3a3a3a] dark:bg-[#303030]";
const newButtonClass =
  "inline-flex w-fit cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500";
const editButtonClass =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#4a4a4a] dark:text-[#d4d4d4] dark:hover:bg-[#303030]";
const deleteButtonClass =
  "cursor-pointer rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40";
const iconTileClass =
  "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-[#303030] dark:text-[#d4d4d4] dark:ring-[#4a4a4a]";
const helperTextClass = "mt-1 text-sm text-slate-600 dark:text-[#a3a3a3]";
const mutedTextClass = "text-slate-600 dark:text-[#a3a3a3]";
const rowDividerClass =
  "mt-4 flex gap-3 border-t border-slate-200 pt-4 dark:border-[#3a3a3a]";

function activeBadge(isActive: boolean | null) {
  return isActive ? (
    <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300 ring-1 ring-green-500/30">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-[#a3a3a3] ring-1 ring-slate-500/20 dark:text-[#a3a3a3]">
      Inactive
    </span>
  );
}

export default async function AdminAthleticsPage({
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
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "athletics", school);

  async function deleteSport(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const sportId = String(formData.get("sport_id") || "");

    const { error } = await supabase
      .from("sports")
      .delete()
      .eq("id", sportId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Delete sport error:", JSON.stringify(error, null, 2));
      return;
    }

    revalidatePath(`/${school}/admin/athletics`);
  }

  async function deleteTeam(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const teamId = String(formData.get("team_id") || "");

    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Delete team error:", JSON.stringify(error, null, 2));
      return;
    }

    revalidatePath(`/${school}/admin/athletics`);
  }

  async function deleteGame(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const gameId = String(formData.get("game_id") || "");

    const { error } = await supabase
      .from("games")
      .delete()
      .eq("id", gameId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Delete game error:", JSON.stringify(error, null, 2));
      return;
    }

    revalidatePath(`/${school}/admin/athletics`);
  }

  const sportsResultWithColor = await supabase
    .from("sports")
    .select("id, name, icon, icon_color, season, is_active")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });
  let sports = sportsResultWithColor.data as Sport[] | null;
  let sportsError = sportsResultWithColor.error;

  if (sportsError?.code === "42703") {
    const fallbackSportsResult = await supabase
      .from("sports")
      .select("id, name, icon, season, is_active")
      .eq("school_id", schoolId)
      .order("name", { ascending: true });

    sports = ((fallbackSportsResult.data || []) as Omit<Sport, "icon_color">[]).map(
      (sport) => ({ ...sport, icon_color: null })
    );
    sportsError = fallbackSportsResult.error;
  }

  const [
    { data: teams, error: teamsError },
    { data: games, error: gamesError },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, sport_id, name, level, gender, coach_name, coach_email, is_active")
      .eq("school_id", schoolId)
      .order("name", { ascending: true }),
    supabase
      .from("games")
      .select("id, team_id, opponent, game_date, location, is_home, notes")
      .eq("school_id", schoolId)
      .order("game_date", { ascending: true }),
  ]);

  if (sportsError) console.error("Sports error:", JSON.stringify(sportsError, null, 2));
  if (teamsError) console.error("Teams error:", JSON.stringify(teamsError, null, 2));
  if (gamesError) console.error("Games error:", JSON.stringify(gamesError, null, 2));

  const sportRows = (sports || []) as Sport[];
  const teamRows = (teams || []) as Team[];
  const gameRows = (games || []) as Game[];
  const sportNameById = new Map(sportRows.map((sport) => [sport.id, sport.name]));
  const sportIconById = new Map(sportRows.map((sport) => [sport.id, sport.icon]));
  const sportIconColorById = new Map(sportRows.map((sport) => [sport.id, sport.icon_color]));
  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
  const teamSportIdById = new Map(teamRows.map((team) => [team.id, team.sport_id]));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-600 dark:text-[#a3a3a3]">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Athletics</h1>
          </div>

        </div>

        <div className="grid gap-6">
          <section className={cardClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Game Schedule</h2>
                <p className={helperTextClass}>
                  Create and manage upcoming games for the student app.
                </p>
              </div>
              <Link href={`/${school}/admin/athletics/games/new`} className={newButtonClass}>
                + New Game
              </Link>
            </div>

            <div className="mt-5 space-y-4">
              {gameRows.length === 0 ? (
                <p className={`${innerCardClass} p-6 text-center text-sm ${mutedTextClass}`}>
                  No games yet. Add teams first, then build the schedule here.
                </p>
              ) : (
                gameRows.map((game) => {
                  const sportId = teamSportIdById.get(game.team_id || "");
                  const icon = sportIconById.get(sportId || "");
                  const iconColor = sportIconColorById.get(sportId || "");

                  return (
                  <article key={game.id} className={`${innerCardClass} p-4`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div className={iconTileClass}>
                          <SportIcon icon={icon} color={iconColor} />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold">
                            {teamNameById.get(game.team_id || "") || "Team"} vs. {game.opponent}
                          </h3>
                          <p className={`mt-2 text-sm ${mutedTextClass}`}>
                            {formatGameDateTime(game.game_date)} · {game.is_home ? "Home" : "Away"}
                            {game.location ? ` · ${game.location}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className={rowDividerClass}>
                      <Link href={`/${school}/admin/athletics/games/${game.id}/edit`} className={editButtonClass}>
                        Edit
                      </Link>
                      <form action={deleteGame}>
                        <input type="hidden" name="game_id" value={game.id} />
                        <button type="submit" className={deleteButtonClass}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                  );
                })
              )}
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Teams</h2>
                <p className={helperTextClass}>
                  Build the teams students will see on game cards.
                </p>
              </div>
              <Link href={`/${school}/admin/athletics/teams/new`} className={newButtonClass}>
                + New Team
              </Link>
            </div>

            <div className="mt-5 space-y-4">
              {teamRows.length === 0 ? (
                <p className={`${innerCardClass} p-6 text-center text-sm ${mutedTextClass}`}>
                  No teams yet.
                </p>
              ) : (
                teamRows.map((team) => (
                  <article key={team.id} className={`${innerCardClass} p-4`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-semibold">{team.name}</h3>
                          {activeBadge(team.is_active)}
                        </div>
                        <p className={`mt-2 text-sm ${mutedTextClass}`}>
                          {sportNameById.get(team.sport_id || "") || "No sport"} · {team.level || "Level not set"} · {team.gender || "Gender not set"}
                        </p>
                        <p className={`mt-1 text-sm ${mutedTextClass}`}>
                          Coach: {team.coach_name || "Not set"}
                        </p>
                      </div>
                    </div>
                    <div className={rowDividerClass}>
                      <Link href={`/${school}/admin/athletics/teams/${team.id}/edit`} className={editButtonClass}>
                        Edit
                      </Link>
                      <form action={deleteTeam}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <button type="submit" className={deleteButtonClass}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sports</h2>
                <p className={helperTextClass}>
                  Manage sport programs, icons, seasons, and availability.
                </p>
              </div>
              <Link href={`/${school}/admin/athletics/sports/new`} className={newButtonClass}>
                + New Sport
              </Link>
            </div>

            <div className="mt-5 space-y-4">
              {sportRows.length === 0 ? (
                <p className={`${innerCardClass} p-6 text-center text-sm ${mutedTextClass}`}>
                  No sports yet.
                </p>
              ) : (
                sportRows.map((sport) => (
                  <article key={sport.id} className={`${innerCardClass} p-4`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <div className={iconTileClass}>
                          <SportIcon icon={sport.icon} color={sport.icon_color} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-xl font-semibold">{sport.name}</h3>
                            {activeBadge(sport.is_active)}
                          </div>
                          <p className={`mt-2 text-sm ${mutedTextClass}`}>
                            Season: {sport.season || "Not set"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className={rowDividerClass}>
                      <Link href={`/${school}/admin/athletics/sports/${sport.id}/edit`} className={editButtonClass}>
                        Edit
                      </Link>
                      <form action={deleteSport}>
                        <input type="hidden" name="sport_id" value={sport.id} />
                        <button type="submit" className={deleteButtonClass}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
