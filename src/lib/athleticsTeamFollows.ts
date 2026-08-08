export const TEAM_FOLLOW_STORAGE_PREFIX =
  "sundial:pwa:athletics:followed-teams:v1";
export const TEAM_FOLLOWS_CHANGED_EVENT =
  "sundial:athletics-team-follows-changed";

export type TeamFollowStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type FollowableTeam = {
  id: string;
};

export type FollowableGame = {
  id: string;
  team_id: string | null;
  game_date: string | null;
};

const inMemoryTeamFollows = new Map<string, string[]>();

function getBrowserStorage(): TeamFollowStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeTeamIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .filter((teamId): teamId is string => typeof teamId === "string")
        .map((teamId) => teamId.trim())
        .filter(Boolean),
    ),
  ];
}

function filterValidTeamIds(
  followedTeamIds: string[],
  validTeamIds?: Iterable<string>,
) {
  if (!validTeamIds) return followedTeamIds;

  const validIds = new Set(validTeamIds);
  return followedTeamIds.filter((teamId) => validIds.has(teamId));
}

export function getTeamFollowStorageKey(schoolId: string) {
  return `${TEAM_FOLLOW_STORAGE_PREFIX}:${schoolId}`;
}

export function readFollowedTeamIds(
  schoolId: string,
  validTeamIds?: Iterable<string>,
  storage: TeamFollowStorage | null = getBrowserStorage(),
) {
  const storageKey = getTeamFollowStorageKey(schoolId);
  if (!storage) {
    return filterValidTeamIds(
      inMemoryTeamFollows.get(storageKey) || [],
      validTeamIds,
    );
  }

  let storedValue: string | null;
  try {
    storedValue = storage.getItem(storageKey);
  } catch {
    return filterValidTeamIds(
      inMemoryTeamFollows.get(storageKey) || [],
      validTeamIds,
    );
  }

  try {
    const followedTeamIds = normalizeTeamIds(JSON.parse(storedValue || "[]"));
    inMemoryTeamFollows.set(storageKey, followedTeamIds);
    return filterValidTeamIds(followedTeamIds, validTeamIds);
  } catch {
    inMemoryTeamFollows.delete(storageKey);
    return [];
  }
}

export function writeFollowedTeamIds(
  schoolId: string,
  followedTeamIds: Iterable<string>,
  storage: TeamFollowStorage | null = getBrowserStorage(),
) {
  const normalizedTeamIds = normalizeTeamIds([...followedTeamIds]);
  const storageKey = getTeamFollowStorageKey(schoolId);

  if (normalizedTeamIds.length === 0) inMemoryTeamFollows.delete(storageKey);
  else inMemoryTeamFollows.set(storageKey, normalizedTeamIds);

  if (storage) {
    try {
      if (normalizedTeamIds.length === 0) {
        storage.removeItem(storageKey);
      } else {
        storage.setItem(storageKey, JSON.stringify(normalizedTeamIds));
      }
    } catch {
      // Keep the preference usable for this session when storage is unavailable.
    }
  }

  if (typeof window !== "undefined") {
    const browserStorage = getBrowserStorage();
    if (storage === browserStorage) {
      window.dispatchEvent(
        new CustomEvent(TEAM_FOLLOWS_CHANGED_EVENT, {
          detail: { schoolId },
        }),
      );
    }
  }

  return normalizedTeamIds;
}

export function getFollowedTeamIdsSnapshot(
  schoolId: string,
  validTeamIds?: Iterable<string>,
) {
  return JSON.stringify(readFollowedTeamIds(schoolId, validTeamIds));
}

export function subscribeToTeamFollows(
  schoolId: string,
  onStoreChange: () => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const storageKey = getTeamFollowStorageKey(schoolId);

  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) onStoreChange();
  }

  function handleLocalChange(event: Event) {
    const changedSchoolId = (event as CustomEvent<{ schoolId?: string }>).detail
      ?.schoolId;
    if (changedSchoolId === schoolId) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(TEAM_FOLLOWS_CHANGED_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(TEAM_FOLLOWS_CHANGED_EVENT, handleLocalChange);
  };
}

export function toggleFollowedTeam(
  followedTeamIds: Iterable<string>,
  teamId: string,
) {
  const nextIds = new Set(followedTeamIds);

  if (nextIds.has(teamId)) nextIds.delete(teamId);
  else nextIds.add(teamId);

  return [...nextIds];
}

export function splitTeamsByFollowState<T extends FollowableTeam>(
  teams: T[],
  followedTeamIds: Iterable<string>,
) {
  const followedIds = new Set(followedTeamIds);

  return {
    following: teams.filter((team) => followedIds.has(team.id)),
    allTeams: teams.filter((team) => !followedIds.has(team.id)),
  };
}

function gameDateParts(value: string | null) {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/);

  if (!match) return null;

  return {
    date: match[1],
    time: match[2] ? `${match[2]}:${match[3]}` : "",
  };
}

export function getFollowedUpcomingGames<T extends FollowableGame>(
  games: T[],
  followedTeamIds: Iterable<string>,
  today: string,
) {
  const followedIds = new Set(followedTeamIds);

  return games
    .filter((game) => {
      const date = gameDateParts(game.game_date)?.date;
      return Boolean(
        game.team_id && followedIds.has(game.team_id) && date && date >= today,
      );
    })
    .sort((left, right) => {
      const leftParts = gameDateParts(left.game_date);
      const rightParts = gameDateParts(right.game_date);
      const dateOrder = (leftParts?.date || "").localeCompare(
        rightParts?.date || "",
      );

      if (dateOrder !== 0) return dateOrder;

      const timeOrder = (leftParts?.time || "").localeCompare(
        rightParts?.time || "",
      );

      return timeOrder || left.id.localeCompare(right.id);
    });
}
