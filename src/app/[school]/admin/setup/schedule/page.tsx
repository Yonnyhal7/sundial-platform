import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";

type SchedulePageProps = {
  params: Promise<{ school: string }>;
};

export default async function ScheduleSetupPage({ params }: SchedulePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="schedule"
      nextStep="complete"
    >
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 5
        </p>
        <h2 className="mt-2 text-2xl font-bold">Schedule Wizard</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Set the foundation for your default bell schedule.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <label className="text-sm font-semibold">
            School Year Start
            <input
              name="schoolYearStart"
              type="date"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            School Year End
            <input
              name="schoolYearEnd"
              type="date"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            Pattern Type
            <select
              name="patternType"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            >
              <option value="one_week">1-week repeating pattern</option>
              <option value="two_week">2-week repeating pattern</option>
            </select>
          </label>
        </div>
        <textarea
          name="weeklyPattern"
          rows={4}
          placeholder="Monday-Friday normal schedule, minimum day every other Wednesday..."
          className="mt-5 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
        />
      </section>
    </SetupLayout>
  );
}
