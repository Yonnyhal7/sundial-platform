import PublicCalendarPage from "@/components/public-site/calendar/PublicCalendarPage";
import { PublicContainer, PublicPageHeader } from "@/components/public-site/PublicSite";
import { loadPublicCalendar } from "@/lib/publicCalendar.server";

export default async function SchoolSchedulePage({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params;
  const calendar = await loadPublicCalendar(slug);

  return <main>
    <PublicPageHeader
      eyebrow={calendar.school.name}
      title="School Calendar"
      description="View bell schedules, special days, and school closures."
    />
    <PublicContainer className="py-10 sm:py-14">
      {calendar.academicYear && <p className="mb-4 text-sm font-bold text-slate-500 dark:text-slate-400">Academic year {calendar.academicYear.label}</p>}
      <PublicCalendarPage calendar={calendar} />
    </PublicContainer>
  </main>;
}
