import Link from "next/link";
import { notFound } from "next/navigation";
import { formatGameDateTime, getSportIconLabel } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type School = {
  id: string;
  name: string;
};

type Sport = {
  id: string;
  name: string;
  icon: string | null;
};

type Team = {
  id: string;
  sport_id: string | null;
  name: string;
  level: string | null;
  gender: string | null;
};

type Game = {
  id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
  home_score: number | null;
  away_score: number | null;
  result: string | null;
};

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function scoreLine(game: Game) {
  if (game.home_score === null && game.away_score === null && !game.result) {
    return null;
  }

  const score =
    game.home_score !== null || game.away_score !== null
      ? `${game.home_score ?? "-"} - ${game.away_score ?? "-"}`
      : "";

  return [score, game.result].filter(Boolean).join(" · ");
}

export default async function MobileAthleticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { school } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "teams" ? "teams" : "games";
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const [{ data: sports }, { data: teams }, { data: games }] = await Promise.all([
    supabase
      .from("sports")
      .select("id, name, icon")
      .eq("school_id", schoolData.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Sport[]>(),
    supabase
      .from("teams")
      .select("id, sport_id, name, level, gender")
      .eq("school_id", schoolData.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<Team[]>(),
    supabase
      .from("games")
      .select("id, team_id, opponent, game_date, location, is_home, home_score, away_score, result")
      .eq("school_id", schoolData.id)
      .gte("game_date", getTodayDateString())
      .order("game_date", { ascending: true })
      .limit(30)
      .returns<Game[]>(),
  ]);

  const sportById = new Map((sports || []).map((sport) => [sport.id, sport]));
  const teamById = new Map((teams || []).map((team) => [team.id, team]));

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Athletics
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          Games and Teams
        </h1>
      </header>

      <nav className="grid grid-cols-2 rounded-[1.25rem] border border-slate-200 bg-white p-1 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        {[
          ["games", "Games"],
          ["teams", "Teams"],
        ].map(([value, label]) => {
          const active = activeTab === value;

          return (
            <Link
              key={value}
              href={`/${school}/app/athletics${value === "teams" ? "?tab=teams" : ""}`}
              className={`rounded-2xl px-4 py-3 text-center text-sm font-black transition ${
                active
                  ? "bg-[var(--school-primary)] text-white"
                  : "text-slate-500 dark:text-[#a3a3a3]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "games" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Upcoming Games
          </h2>

          {games?.map((game) => {
            const team = teamById.get(game.team_id || "");
            const sport = sportById.get(team?.sport_id || "");

            return (
              <article
                key={game.id}
                className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <div className="flex gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-sm font-black text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                    {getSportIconLabel(sport?.icon)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-950 dark:text-white">
                      {team?.name || "Team"} vs {game.opponent}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                      {formatGameDateTime(game.game_date)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 dark:bg-[#181818] dark:text-[#d4d4d4]">
                        {game.is_home ? "Home" : "Away"}
                      </span>
                      {game.location && (
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 dark:bg-[#181818] dark:text-[#d4d4d4]">
                          {game.location}
                        </span>
                      )}
                      {scoreLine(game) && (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] px-3 py-1.5 text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                          {scoreLine(game)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {!games?.length && (
            <p className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-[#a3a3a3]">
              No upcoming games are posted yet.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Teams
          </h2>

          {teams?.map((team) => {
            const sport = sportById.get(team.sport_id || "");

            return (
              <article
                key={team.id}
                className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600 dark:bg-[#181818] dark:text-[#d4d4d4]">
                  {getSportIconLabel(sport?.icon)}
                </div>
                <div>
                  <h3 className="font-black text-slate-950 dark:text-white">
                    {team.name}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    {sport?.name || "Sport"}
                  </p>
                </div>
              </article>
            );
          })}

          {!teams?.length && (
            <p className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-[#a3a3a3]">
              No active teams are posted yet.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
