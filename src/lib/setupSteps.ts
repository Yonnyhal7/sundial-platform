export const SETUP_STEPS = [
  {
    slug: "welcome",
    label: "Welcome",
  },
  {
    slug: "school-profile",
    label: "School Information",
  },
  {
    slug: "branding",
    label: "Branding",
  },
  {
    slug: "administrators",
    label: "Administrators",
  },
  {
    slug: "schedule",
    label: "Schedule",
  },
  {
    slug: "complete",
    label: "Complete",
  },
] as const;

export type SetupStepSlug = (typeof SETUP_STEPS)[number]["slug"];

export const DEFAULT_SETUP_STEP: SetupStepSlug = "welcome";

export function isSetupStepSlug(value: string | null | undefined): value is SetupStepSlug {
  return SETUP_STEPS.some((step) => step.slug === value);
}

export function normalizeSetupStep(value: string | null | undefined): SetupStepSlug {
  return isSetupStepSlug(value) ? value : DEFAULT_SETUP_STEP;
}

export function getSetupStepIndex(step: SetupStepSlug) {
  return SETUP_STEPS.findIndex((setupStep) => setupStep.slug === step);
}

export function getNextSetupStep(step: SetupStepSlug) {
  const nextStep = SETUP_STEPS[getSetupStepIndex(step) + 1];
  return nextStep?.slug || step;
}

export function getPreviousSetupStep(step: SetupStepSlug) {
  const previousStep = SETUP_STEPS[getSetupStepIndex(step) - 1];
  return previousStep?.slug || null;
}

export function getSetupStepNumber(step: SetupStepSlug) {
  return getSetupStepIndex(step) + 1;
}
