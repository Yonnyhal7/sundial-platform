"use client";

import ScheduleWizardClient, {
  type ExistingCalendarRangeSummary,
  type WizardScheduleSummary,
} from "./schedule-wizard-client";
import type { CalendarWizardDraftRecord } from "@/lib/calendarWizard/draftPersistence";

export default function GuidedCalendarWizardClient(props: {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  adminBasePath: string;
  schedules: WizardScheduleSummary[];
  existingCalendarRange: ExistingCalendarRangeSummary;
  initialSavedDraft: CalendarWizardDraftRecord | null;
}) {
  return <ScheduleWizardClient {...props} flowMode="guided" />;
}
