import Link from "next/link";
import type { ReactNode } from "react";
import {
  getSchoolAdminPath,
  getSchoolSetupStepPath,
} from "@/lib/auth/adminPermissions";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";
import {
  getNextSetupStep,
  getPreviousSetupStep,
  getSetupStepNumber,
  SETUP_STEPS,
  type SetupStepSlug,
} from "@/lib/setupSteps";
import { continueSetupStepAction, saveSetupProgressAction } from "./actions";

type SetupLayoutProps = {
  school: string;
  schoolName: string;
  currentStep: SetupStepSlug;
  nextStep?: SetupStepSlug;
  continueLabel?: string;
  continueAction?: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

function SetupProgress({
  currentStep,
  stepHrefs,
}: {
  currentStep: SetupStepSlug;
  stepHrefs: Record<SetupStepSlug, string>;
}) {
  const currentStepNumber = getSetupStepNumber(currentStep);

  return (
    <div className="mt-8">
      <p className="text-sm font-semibold text-slate-500">
        Step {currentStepNumber} of {SETUP_STEPS.length}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 text-xs sm:grid-cols-3 xl:grid-cols-6">
        {SETUP_STEPS.map((step, index) => {
          const isCurrent = step.slug === currentStep;
          const stepNumber = index + 1;

          return (
            <div
              key={step.slug}
              className="relative flex flex-col items-center text-center"
            >
              <Link
                href={stepHrefs[step.slug]}
                className={[
                  "group relative z-10 flex cursor-pointer flex-col items-center rounded-lg px-2 py-1 transition",
                  isCurrent
                    ? "text-slate-950"
                    : "text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100",
                ].join(" ")}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition",
                    isCurrent
                      ? "border-[#D4A017] bg-[#D4A017] text-white shadow-sm shadow-[#D4A017]/20"
                      : "border-slate-200 bg-white text-slate-400 group-hover:border-slate-300",
                  ].join(" ")}
                >
                  {stepNumber}
                </span>
                <span
                  className={[
                    "mt-2 font-medium",
                    isCurrent ? "text-slate-950" : "text-inherit",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </Link>
              {index < SETUP_STEPS.length - 1 && (
                <span className="absolute left-[calc(50%+1rem)] top-4 hidden h-px w-[calc(100%-2rem)] bg-slate-200 xl:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function SetupLayout({
  school,
  schoolName,
  currentStep,
  nextStep,
  continueLabel = "Continue",
  continueAction = continueSetupStepAction,
  children,
}: SetupLayoutProps) {
  const resolvedNextStep = nextStep || getNextSetupStep(currentStep);
  const previousStep = getPreviousSetupStep(currentStep);
  const backHref = previousStep
    ? await getSchoolSetupStepPath(school, previousStep)
    : await getSchoolAdminPath(school);
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
              First Login Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{schoolName}</h1>
          </div>
          <Link
            href="mailto:support@sundialk12.com"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-[#242424] dark:text-slate-200"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              ?
            </span>
            Help
          </Link>
        </div>

        <SetupProgress currentStep={currentStep} stepHrefs={stepHrefs} />

        <form action={continueAction}>
          <input type="hidden" name="school" value={school} />
          <input type="hidden" name="currentStep" value={currentStep} />
          <input type="hidden" name="nextStep" value={resolvedNextStep} />

          {children}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
            <Link
              href={backHref}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Back
            </Link>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                formAction={saveSetupProgressAction}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Save & Exit
              </button>
              <button
                type="submit"
                className={sundialPrimaryButtonClass("px-5 py-2.5")}
              >
                {continueLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
