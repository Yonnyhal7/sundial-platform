export type SchoolDayEvent = {
  id: string;
  title: string;
  location: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  is_featured?: boolean;
};

export type SchoolDayGame = {
  id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
};

function storedDateKey(value: string | null | undefined) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function timeSortKey(value: string | null | undefined) {
  const match = value?.match(/(?:^|T|\s)(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function getEventsForSchoolDate<T extends SchoolDayEvent>(events: T[], date: string) {
  return events
    .filter((event) => storedDateKey(event.event_date) === date)
    .sort((left, right) => {
      if (!left.start_time && right.start_time) return -1;
      if (left.start_time && !right.start_time) return 1;
      return timeSortKey(left.start_time).localeCompare(timeSortKey(right.start_time));
    });
}

export function getFeaturedEvent<T extends SchoolDayEvent>(events: T[], today: string) {
  return (
    events.find((event) => event.is_featured) ||
    events.find((event) => (storedDateKey(event.event_date) || "") >= today)
  );
}

export function getGamesForSchoolDate<T extends SchoolDayGame>(games: T[], date: string) {
  return games
    .filter((game) => storedDateKey(game.game_date) === date)
    .sort((left, right) => timeSortKey(left.game_date).localeCompare(timeSortKey(right.game_date)));
}
