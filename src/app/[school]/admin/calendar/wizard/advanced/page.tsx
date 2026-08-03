import { notFound } from "next/navigation";
import { AdvancedImportProvider, AdvancedImportWizard, isAdvancedAiImportEnabled } from "@/features/advanced-ai-import";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { AI_CALENDAR_WIZARD_DRAFT_TYPE } from "@/lib/calendarWizard/draftPersistence";
import { parseCalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";
import { isSchoolFeatureAvailable } from "@/lib/schoolFeatures.server";
import { loadCalendarWizardPageData } from "../page-data";

export default async function AdvancedAiImportPage({ params, searchParams }: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  if (!isAdvancedAiImportEnabled()) notFound();
  const { school } = await params;
  const { from } = await searchParams;
  const data = await loadCalendarWizardPageData(school, AI_CALENDAR_WIZARD_DRAFT_TYPE);
  if (!await isSchoolFeatureAvailable(data.schoolId, "ai_calendar_import")) notFound();
  return (
    <AdvancedImportProvider>
      <AdvancedImportWizard
        {...data}
        aiCalendarDebugEnabled={process.env.AI_CALENDAR_DEBUG === "true"}
        launchContext={parseCalendarWizardLaunchContext(from)}
        setupChooserHref={await getSchoolSetupStepPath(school, "schedule")}
      />
    </AdvancedImportProvider>
  );
}
