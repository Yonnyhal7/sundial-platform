import type { Metadata } from "next";
import AthleticsExperience, {
  type AthleticsGame,
  type AthleticsSport,
  type AthleticsTeam,
} from "@/components/mobile-app/AthleticsExperience";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { createNavDiagnostics } from "@/lib/navDiagnostics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateInTimeZone } from "@/lib/localDate";

export const metadata: Metadata = { title: "Athletics" };

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
  const navTiming = createNavDiagnostics("athletics", school);
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    navTiming.query("school", () => requireMobileAppSchool(school)),
  ]);
  const today = formatDateInTimeZone(new Date(), schoolData.timezone);

  const [sportsResultWithColor, { data: teams }, { data: games }] =
    await Promise.all([
      navTiming.query("sports", () =>
        supabase
          .from("sports")
          .select("id, name, icon, icon_color")
          .eq("school_id", schoolData.id)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(50)
          .returns<AthleticsSport[]>(),
      ),
      navTiming.query("teams", () =>
        supabase
          .from("teams")
          .select("id, sport_id, name, level, gender")
          .eq("school_id", schoolData.id)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(100)
          .returns<AthleticsTeam[]>(),
      ),
      navTiming.query("games", () =>
        supabase
          .from("games")
          .select("id, team_id, opponent, game_date, location, is_home")
          .eq("school_id", schoolData.id)
          .gte("game_date", today)
          .order("game_date", { ascending: true })
          .limit(100)
          .returns<AthleticsGame[]>(),
      ),
    ]);
  let sports = sportsResultWithColor.data as AthleticsSport[] | null;

  if (sportsResultWithColor.error?.code === "42703") {
    const fallbackSportsResult = await navTiming.query("sports_fallback", () =>
      supabase
        .from("sports")
        .select("id, name, icon")
        .eq("school_id", schoolData.id)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(50)
        .returns<Omit<AthleticsSport, "icon_color">[]>(),
    );

    sports = (fallbackSportsResult.data || []).map((sport) => ({
      ...sport,
      icon_color: null,
    }));
  }

  navTiming.log();

  return (
    <AthleticsExperience
      schoolId={schoolData.id}
      sports={sports || []}
      teams={teams || []}
      games={games || []}
      today={today}
      initialTab={activeTab}
    />
  );
}
