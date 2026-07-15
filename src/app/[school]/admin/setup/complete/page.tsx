import { redirect } from "next/navigation";
import { SETUP_STEPS } from "@/lib/setupSteps";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { getScheduleSetupReadiness } from "@/lib/setupCalendarCompletion";
import { finishSchoolSetupAction } from "../actions";
import { getSetupContext } from "../context";
import SetupLayout from "../setup-layout";

type CompletePageProps = {
  params: Promise<{ school: string }>;
};

export default async function CompleteSetupPage({ params }: CompletePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);
  const scheduleReadiness = await getScheduleSetupReadiness(
    context.supabase,
    context.schoolData.id
  );

  if (!scheduleReadiness.complete || context.savedStep !== "complete") {
    redirect(await getSchoolSetupStepPath(school, "schedule"));
  }
  const schedulesNeedingTimes = scheduleReadiness.schedulesNeedingTimes;

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="complete"
      continueLabel="🚀 Launch School"
      continueAction={finishSchoolSetupAction}
    >
      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-[#242424] lg:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 6
        </p>
        <div className="mx-auto mt-4 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl text-emerald-600 dark:bg-emerald-500/15">
          ✓
        </div>
        <h2 className="mt-7 text-3xl font-bold tracking-tight">
          Launch School
        </h2>
        <h3 className="mt-3 text-xl font-bold tracking-tight">
          Your school is ready!
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          Everything has been configured successfully. You&apos;re ready to
          begin using Sundial.
        </p>

        {schedulesNeedingTimes.length > 0 && (
          <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
            <h3 className="text-base font-bold text-amber-950 dark:text-amber-100">
              Your calendar is ready
            </h3>
            <p className="mt-2">
              Some schedule templates still need bell times. You can add them
              later from Dashboard → Schedules.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {schedulesNeedingTimes.map((schedule) => (
                <li key={schedule.id} className="rounded-xl bg-white px-3 py-2 dark:bg-black">
                  {schedule.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left dark:border-slate-700 dark:bg-black">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Completed
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SETUP_STEPS.filter((step) => step.slug !== "complete").map((step) => (
              <div key={step.slug} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  ✓
                </span>
                <span className="text-sm font-semibold">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SetupLayout>
  );
}
