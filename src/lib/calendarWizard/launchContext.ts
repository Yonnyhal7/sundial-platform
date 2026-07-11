export type CalendarWizardLaunchContext = "setup";

export function parseCalendarWizardLaunchContext(
  value: string | string[] | null | undefined
): CalendarWizardLaunchContext | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "setup" ? "setup" : null;
}

export function appendCalendarWizardLaunchContext(
  href: string,
  context: CalendarWizardLaunchContext | null | undefined
) {
  if (!context) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=${context}`;
}
