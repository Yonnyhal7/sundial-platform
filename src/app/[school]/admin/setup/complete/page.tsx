import { finishSchoolSetupAction } from "../actions";
import { getSetupContext } from "../context";
import SetupLayout from "../setup-layout";

type CompletePageProps = {
  params: Promise<{ school: string }>;
};

export default async function CompleteSetupPage({ params }: CompletePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="complete"
      continueLabel="Go to Dashboard"
      continueAction={finishSchoolSetupAction}
    >
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-700 dark:bg-[#242424]">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl text-emerald-600 dark:bg-emerald-500/15">
          ✓
        </div>
        <h2 className="mt-7 text-3xl font-bold tracking-tight">
          Your school is ready!
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          You&apos;ve completed the setup foundation. Finish setup to unlock the
          full school admin dashboard.
        </p>
      </section>
    </SetupLayout>
  );
}
