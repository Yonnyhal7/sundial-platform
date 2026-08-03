"use client";

import ScheduleWizardClient, { type ExistingCalendarRangeSummary, type WizardScheduleSummary } from "@/app/[school]/admin/calendar/wizard/schedule-wizard-client";
import type { CalendarWizardDraftRecord } from "@/lib/calendarWizard/draftPersistence";
import type { CalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";
import { useAdvancedImport } from "../providers/AdvancedImportProvider";
import { ImportSessionDebugViewer } from "./ImportSessionDebugViewer";

export type AdvancedImportWizardProps = {
  schoolId: string; schoolSlug: string; schoolName: string; adminBasePath: string;
  launchContext: CalendarWizardLaunchContext | null; setupChooserHref: string;
  schedules: WizardScheduleSummary[]; existingCalendarRange: ExistingCalendarRangeSummary;
  initialSavedDraft: CalendarWizardDraftRecord | null; aiCalendarDebugEnabled: boolean;
  importSessionDebugEnabled?: boolean;
};

export function AdvancedImportWizard(props: AdvancedImportWizardProps) {
  const { recordEvent, sessionId } = useAdvancedImport();
  return <><ScheduleWizardClient {...props} flowMode="ai" aiImportVariant="advanced" onAiImportEvent={recordEvent} />{props.importSessionDebugEnabled && sessionId && <ImportSessionDebugViewer schoolSlug={props.schoolSlug} sessionId={sessionId} />}</>;
}
