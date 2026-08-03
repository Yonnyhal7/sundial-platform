"use client";

import ScheduleWizardClient, { type ExistingCalendarRangeSummary, type WizardScheduleSummary } from "@/app/[school]/admin/calendar/wizard/schedule-wizard-client";
import type { CalendarWizardDraftRecord } from "@/lib/calendarWizard/draftPersistence";
import type { CalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";
import { useAdvancedImport } from "../providers/AdvancedImportProvider";

export type AdvancedImportWizardProps = {
  schoolId: string; schoolSlug: string; schoolName: string; adminBasePath: string;
  launchContext: CalendarWizardLaunchContext | null; setupChooserHref: string;
  schedules: WizardScheduleSummary[]; existingCalendarRange: ExistingCalendarRangeSummary;
  initialSavedDraft: CalendarWizardDraftRecord | null; aiCalendarDebugEnabled: boolean;
};

export function AdvancedImportWizard(props: AdvancedImportWizardProps) {
  const { recordEvent } = useAdvancedImport();
  return <ScheduleWizardClient {...props} flowMode="ai" aiImportVariant="advanced" onAiImportEvent={recordEvent} />;
}
