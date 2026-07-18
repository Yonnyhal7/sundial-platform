"use client";

import ScheduleWizardClient, {
  type ExistingCalendarRangeSummary,
  type WizardScheduleSummary,
} from "./schedule-wizard-client";
import type { CalendarWizardDraftRecord } from "@/lib/calendarWizard/draftPersistence";
import type { CalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";

export default function AiCalendarWizardClient(props: {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  adminBasePath: string;
  launchContext: CalendarWizardLaunchContext | null;
  setupChooserHref: string;
  schedules: WizardScheduleSummary[];
  existingCalendarRange: ExistingCalendarRangeSummary;
  initialSavedDraft: CalendarWizardDraftRecord | null;
  aiCalendarDebugEnabled: boolean;
}) {
  return <ScheduleWizardClient {...props} flowMode="ai" />;
}
