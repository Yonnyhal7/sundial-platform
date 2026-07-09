import Link from "next/link";
import type { ReactNode } from "react";
import {
  getSchoolAdminPath,
  getSchoolSetupStepPath,
} from "@/lib/auth/adminPermissions";
import { setupPrimaryButtonClass } from "@/lib/ui/setupStyles";
import {
  getNextSetupStep,
  getPreviousSetupStep,
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
                className={setupPrimaryButtonClass("px-5 py-2.5")}
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
