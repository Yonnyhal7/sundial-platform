import Link from "next/link";
import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";
import { getSchoolAdminPath } from "@/lib/auth/adminPermissions";
import {
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  summarizeCalendarWizardDraft,
  type CalendarWizardDraftRecord,
} from "@/lib/calendarWizard/draftPersistence";
import { setupPrimaryButtonClass } from "@/lib/ui/setupStyles";
import { loadCalendarWizardDraft } from "../../calendar/wizard/actions";

type SchedulePageProps = {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ saved?: string }>;
};

export default async function OnboardingSchedulePage({
  params,
  searchParams,
}: SchedulePageProps) {
  const { school } = await params;
  const { saved } = await searchParams;
  const context = await getSetupContext(school);
  const adminBasePath = await getSchoolAdminPath(school);
  const [aiDraftResult, guidedDraftResult] = await Promise.all([
    loadCalendarWizardDraft(school, AI_CALENDAR_WIZARD_DRAFT_TYPE),
    loadCalendarWizardDraft(school, GUIDED_CALENDAR_WIZARD_DRAFT_TYPE),
  ]);
  const drafts = [
    aiDraftResult.status === "success" && aiDraftResult.draft
      ? {
          key: "ai",
          title: "Continue AI Calendar Import",
          href: `${adminBasePath}/calendar/wizard/ai?from=setup`,
          draft: aiDraftResult.draft,
        }
      : null,
    guidedDraftResult.status === "success" && guidedDraftResult.draft
      ? {
          key: "guided",
          title: "Continue Guided Setup",
          href: `${adminBasePath}/calendar/wizard/guided?from=setup`,
          draft: guidedDraftResult.draft,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: "ai" | "guided";
    title: string;
    href: string;
    draft: CalendarWizardDraftRecord;
  }>;

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="schedule"
      nextStep="complete"
      showFooter={false}
    >
      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424] lg:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 5
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">
          Set Up Your School Calendar
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Choose the fastest way to build your school-year calendar.
        </p>

        {saved === "1" && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            Your calendar setup has been saved. Finish it before launching the school.
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
            <h3 className="text-lg font-bold text-amber-950 dark:text-amber-100">
              Resume saved progress
            </h3>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {drafts.map((item) => {
                const summary = summarizeCalendarWizardDraft(item.draft.wizard_data);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="rounded-2xl bg-white p-4 text-left shadow-sm transition hover:bg-amber-100 dark:bg-black dark:hover:bg-amber-950/40"
                  >
                    <span className="text-sm font-bold text-amber-950 dark:text-amber-100">
                      {item.title}
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {summary.schoolYearLabel || "School-Year Calendar Draft"} -{" "}
                      {summary.completionPercentage}% complete - Last updated{" "}
                      {new Date(item.draft.updated_at).toLocaleString("en-US")}
                    </span>
                    {item.key === "ai" && (
                      <span className="mt-1 block text-xs font-semibold text-amber-900 dark:text-amber-100">
                        {summary.remainingScheduleCount}{" "}
                        {summary.remainingScheduleCount === 1 ? "schedule" : "schedules"}{" "}
                        still need bell times
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <CalendarSetupChoiceCard
            title="AI Calendar Import"
            badge="Beta"
            description="Upload your school calendar PDF and let Sundial detect dates, schedules, holidays, and special days."
            highlights={[
              "Upload a PDF",
              "Review what Sundial found",
              "Create missing schedules automatically",
              "Add bell times now or later",
            ]}
            href={`${adminBasePath}/calendar/wizard/ai?from=setup`}
            cta="Use AI Import"
          />
          <CalendarSetupChoiceCard
            title="Guided Setup"
            description="Build your calendar step by step with Sundial."
            highlights={[
              "Set school-year dates",
              "Choose the normal schedule pattern",
              "Add no-school days",
              "Add special days",
              "Review before creating",
            ]}
            href={`${adminBasePath}/calendar/wizard/guided?from=setup`}
            cta="Start Guided Setup"
          />
        </div>
      </section>
    </SetupLayout>
  );
}

function CalendarSetupChoiceCard({
  title,
  badge,
  description,
  highlights,
  href,
  cta,
}: {
  title: string;
  badge?: string;
  description: string;
  highlights: string[];
  href: string;
  cta: string;
}) {
  return (
    <section className="flex min-h-full flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-black">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-2xl font-bold">{title}</h3>
        {badge && (
          <span className="rounded-full bg-[#D4A017]/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#9A7209] dark:text-[#F6C64A]">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <ul className="mt-5 flex-1 space-y-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {highlights.map((highlight) => (
          <li key={highlight} className="flex gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-[#D4A017]" aria-hidden="true" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Link href={href} className={setupPrimaryButtonClass("w-full justify-center sm:w-auto")}>
          {cta}
        </Link>
      </div>
    </section>
  );
}
