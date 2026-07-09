export const SETUP_STEPS = [
  {
    slug: "welcome",
    label: "Welcome",
  },
  {
    slug: "school-profile",
    label: "School Profile",
  },
  {
    slug: "appearance",
    label: "Appearance",
  },
  {
    slug: "administrators",
    label: "Users",
  },
  {
    slug: "schedule",
    label: "Schedule Wizard",
  },
  {
    slug: "complete",
    label: "Launch School",
  },
] as const;

export type SetupStepSlug = (typeof SETUP_STEPS)[number]["slug"];

export const DEFAULT_SETUP_STEP: SetupStepSlug = "welcome";

const LEGACY_SETUP_STEP_ALIASES: Record<string, SetupStepSlug> = {
  branding: "appearance",
};

export function isSetupStepSlug(value: string | null | undefined): value is SetupStepSlug {
  return SETUP_STEPS.some((step) => step.slug === value);
}

export function normalizeSetupStep(value: string | null | undefined): SetupStepSlug {
  if (value && value in LEGACY_SETUP_STEP_ALIASES) {
    return LEGACY_SETUP_STEP_ALIASES[value];
  }

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
