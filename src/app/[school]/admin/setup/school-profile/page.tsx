import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";

type SchoolProfilePageProps = {
  params: Promise<{ school: string }>;
};

export default async function SchoolProfileSetupPage({
  params,
}: SchoolProfilePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="school-profile"
      nextStep="branding"
    >
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 2
        </p>
        <h2 className="mt-2 text-2xl font-bold">School Profile</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Let&apos;s start with your school&apos;s basic information.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold">
            School Name
            <input
              name="schoolName"
              defaultValue={context.schoolData.name}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            District Name
            <input
              name="districtName"
              defaultValue={context.district?.name || ""}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            Mascot
            <input
              name="mascot"
              defaultValue={context.schoolData.mascot || ""}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-sm font-semibold">Logo Upload</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Upload placeholder. File storage wiring comes later.
            </p>
          </div>
        </div>
      </section>
    </SetupLayout>
  );
}
