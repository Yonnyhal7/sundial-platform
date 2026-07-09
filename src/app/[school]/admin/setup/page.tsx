import Link from "next/link";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import {
  getSetupStepStatus,
  SETUP_STEPS,
  type SetupStepSlug,
} from "@/lib/setupSteps";
import { setupAccent } from "@/lib/ui/setupStyles";
import { getSetupContext } from "./context";

type SetupRootPageProps = {
  params: Promise<{ school: string }>;
};

export default async function SchoolSetupRootPage({ params }: SetupRootPageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);
  const stepHrefs = Object.fromEntries(
    await Promise.all(
      SETUP_STEPS.map(async (step) => [
        step.slug,
        await getSchoolSetupStepPath(school, step.slug),
      ])
    )
  ) as Record<SetupStepSlug, string>;

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950 dark:bg-black dark:text-white lg:p-10">
      <div className="w-full max-w-[96rem]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424] lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            School Setup
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            School Setup
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            Finish these steps to launch your school.
          </p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SETUP_STEPS.map((step) => {
            const savedStatus = getSetupStepStatus(
              step.slug,
              context.savedStep,
              Boolean(context.schoolData.setup_complete)
            );
            const status =
              savedStatus === "completed"
                ? "completed"
                : savedStatus === "current"
                  ? "current"
                  : "upcoming";

            return (
              <Link
                key={step.slug}
                href={stepHrefs[step.slug]}
                className={[
                  "group flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#242424]",
                  status === "current"
                    ? setupAccent.selectedCard
                    : status === "completed"
                      ? "border-emerald-200 dark:border-emerald-900/70"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                      status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : status === "current"
                          ? "bg-[#D4A017] text-slate-950"
                          : "border border-slate-200 text-slate-400 dark:border-slate-700",
                    ].join(" ")}
                  >
                    {status === "completed" ? "✓" : "□"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600 dark:bg-black dark:text-slate-300">
                    {status}
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-bold tracking-tight">
                  {step.label}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {step.description}
                </p>
                <span className={["mt-5 inline-flex text-sm font-semibold group-hover:underline", setupAccent.link].join(" ")}>
                  Open step
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
