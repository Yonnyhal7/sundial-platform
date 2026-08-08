"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import SportIcon from "@/components/SportIcon";
import { CheckIcon } from "@/components/mobile-app/AppIcons";
import { formatGameDateTime } from "@/lib/athletics";
import {
  getFollowedUpcomingGames,
  getFollowedTeamIdsSnapshot,
  splitTeamsByFollowState,
  subscribeToTeamFollows,
  toggleFollowedTeam,
  writeFollowedTeamIds,
} from "@/lib/athleticsTeamFollows";

export type AthleticsSport = {
  id: string;
  name: string;
  icon: string | null;
  icon_color: string | null;
};

export type AthleticsTeam = {
  id: string;
  sport_id: string | null;
  name: string;
  level: string | null;
  gender: string | null;
};

export type AthleticsGame = {
  id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
};

type AthleticsTab = "games" | "teams";

function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <h3 className="font-black text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
        {children}
      </p>
      {action}
    </div>
  );
}

function FollowButton({
  team,
  following,
  onToggle,
}: {
  team: AthleticsTeam;
  following: boolean;
  onToggle: (teamId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${following ? "Unfollow" : "Follow"} ${team.name}`}
      aria-pressed={following}
      onClick={() => onToggle(team.id)}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition ${
        following
          ? "border-[var(--school-primary)] bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[var(--school-primary)] hover:text-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-[#d4d4d4]"
      }`}
    >
      {following ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
      )}
      {following ? "Following" : "Follow"}
    </button>
  );
}

function TeamCard({
  team,
  sport,
  following,
  onToggle,
}: {
  team: AthleticsTeam;
  sport: AthleticsSport | undefined;
  following: boolean;
  onToggle: (teamId: string) => void;
}) {
  return (
    <article className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600 dark:bg-[#181818] dark:text-[#d4d4d4]">
        <SportIcon
          icon={sport?.icon}
          color={sport?.icon_color}
          className="h-5 w-5"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-black text-slate-950 dark:text-white">
          {team.name}
        </h3>
        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          {sport?.name || "Sport"}
        </p>
      </div>
      <FollowButton team={team} following={following} onToggle={onToggle} />
    </article>
  );
}

function GameCard({
  game,
  team,
  sport,
}: {
  game: AthleticsGame;
  team: AthleticsTeam | undefined;
  sport: AthleticsSport | undefined;
}) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <div className="flex gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-sm font-black text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
          <SportIcon icon={sport?.icon} color={sport?.icon_color} />
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
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AthleticsExperience({
  schoolId,
  sports,
  teams,
  games,
  today,
  initialTab,
}: {
  schoolId: string;
  sports: AthleticsSport[];
  teams: AthleticsTeam[];
  games: AthleticsGame[];
  today: string;
  initialTab: AthleticsTab;
}) {
  const [activeTab, setActiveTab] = useState<AthleticsTab>(initialTab);
  const validTeamIds = useMemo(
    () => new Set(teams.map((team) => team.id)),
    [teams],
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToTeamFollows(schoolId, onStoreChange),
    [schoolId],
  );
  const getSnapshot = useCallback(
    () => getFollowedTeamIdsSnapshot(schoolId, validTeamIds),
    [schoolId, validTeamIds],
  );
  const followedTeamSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
  const followStateReady = followedTeamSnapshot !== null;
  const followedTeamIds = useMemo<string[]>(
    () => (followedTeamSnapshot ? JSON.parse(followedTeamSnapshot) : []),
    [followedTeamSnapshot],
  );
  const sportById = useMemo(
    () => new Map(sports.map((sport) => [sport.id, sport])),
    [sports],
  );
  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );
  const teamSections = useMemo(
    () => splitTeamsByFollowState(teams, followedTeamIds),
    [followedTeamIds, teams],
  );
  const followedGames = useMemo(
    () => getFollowedUpcomingGames(games, followedTeamIds, today),
    [followedTeamIds, games, today],
  );

  function switchTab(tab: AthleticsTab) {
    setActiveTab(tab);

    const url = new URL(window.location.href);
    if (tab === "teams") url.searchParams.set("tab", "teams");
    else url.searchParams.delete("tab");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function toggleTeam(teamId: string) {
    if (!followStateReady) return;

    const nextIds = toggleFollowedTeam(followedTeamIds, teamId);
    writeFollowedTeamIds(schoolId, nextIds);
  }

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

      <nav
        aria-label="Athletics views"
        className="grid grid-cols-2 rounded-[1.25rem] border border-slate-200 bg-white p-1 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
      >
        {(["games", "teams"] as const).map((tab) => {
          const active = activeTab === tab;
          const label = tab === "games" ? "Games" : "Teams";

          return (
            <button
              key={tab}
              type="button"
              aria-pressed={active}
              onClick={() => switchTab(tab)}
              className={`rounded-2xl px-4 py-3 text-center text-sm font-black transition ${
                active
                  ? "bg-[var(--school-primary)] text-white"
                  : "text-slate-500 dark:text-[#a3a3a3]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {activeTab === "games" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Your Upcoming Games
          </h2>

          {!followStateReady ? (
            <EmptyState title="Loading your teams">
              Checking the teams followed on this device.
            </EmptyState>
          ) : followedTeamIds.length === 0 ? (
            <EmptyState
              title="No teams followed yet"
              action={
                <button
                  type="button"
                  onClick={() => switchTab("teams")}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--school-primary)] px-4 py-2 text-sm font-black text-[var(--school-primary-text)]"
                >
                  Browse Teams
                </button>
              }
            >
              Follow teams to see their upcoming games here.
            </EmptyState>
          ) : followedGames.length === 0 ? (
            <EmptyState title="No upcoming games">
              Your followed teams don&apos;t have any upcoming games scheduled.
            </EmptyState>
          ) : (
            followedGames.map((game) => {
              const team = teamById.get(game.team_id || "");
              const sport = sportById.get(team?.sport_id || "");

              return (
                <GameCard key={game.id} game={game} team={team} sport={sport} />
              );
            })
          )}
        </section>
      ) : (
        <div className="space-y-6">
          {!followStateReady ? (
            <EmptyState title="Loading your teams">
              Checking the teams followed on this device.
            </EmptyState>
          ) : (
            <>
              {teamSections.following.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">
                    Following
                  </h2>
                  {teamSections.following.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      sport={sportById.get(team.sport_id || "")}
                      following
                      onToggle={toggleTeam}
                    />
                  ))}
                </section>
              )}

              <section className="space-y-3">
                <h2 className="text-lg font-black text-slate-950 dark:text-white">
                  All Teams
                </h2>
                {teamSections.allTeams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    sport={sportById.get(team.sport_id || "")}
                    following={false}
                    onToggle={toggleTeam}
                  />
                ))}
                {teams.length === 0 && (
                  <EmptyState title="No active teams">
                    No active teams are posted yet.
                  </EmptyState>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
