export const SETUP_STEPS = [
  {
    slug: "welcome",
    label: "Welcome",
    description: "Start the onboarding checklist and review what happens next.",
  },
  {
    slug: "school-profile",
    label: "School Profile",
    description: "Configure your school's name, district, mascot, and logo.",
  },
  {
    slug: "appearance",
    label: "Appearance",
    description: "Choose your school color, accent color, logo, and visual style.",
  },
  {
    slug: "administrators",
    label: "Users",
    description: "Add the administrators and editors who will manage your school.",
  },
  {
    slug: "schedule",
    label: "Schedule Wizard",
    description: "Generate your school year calendar and bell schedule foundation.",
  },
  {
    slug: "complete",
    label: "Launch School",
    description: "Review everything and unlock the full School Admin Dashboard.",
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

export type SetupStepStatus = "completed" | "current" | "upcoming";

export function getCompletedSetupStepCount(
  currentStep: SetupStepSlug,
  setupComplete = false
) {
  if (setupComplete) {
    return SETUP_STEPS.length;
  }

  return Math.max(0, getSetupStepIndex(currentStep));
}

export function getSetupStepStatus(
  step: SetupStepSlug,
  currentStep: SetupStepSlug,
  setupComplete = false
): SetupStepStatus {
  if (setupComplete) {
    return "completed";
  }

  const stepIndex = getSetupStepIndex(step);
  const currentIndex = getSetupStepIndex(currentStep);

  if (stepIndex < currentIndex) {
    return "completed";
  }

  if (stepIndex === currentIndex) {
    return "current";
  }

  return "upcoming";
}
