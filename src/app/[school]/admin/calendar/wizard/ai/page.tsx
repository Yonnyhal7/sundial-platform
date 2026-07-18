import AiCalendarWizardClient from "../ai-calendar-wizard-client";
import { AI_DRAFT_TYPE, loadCalendarWizardPageData } from "../page-data";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { parseCalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";

export default async function AiCalendarWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { school } = await params;
  const { from } = await searchParams;
  const data = await loadCalendarWizardPageData(school, AI_DRAFT_TYPE);
  const launchContext = parseCalendarWizardLaunchContext(from);

  return (
    <AiCalendarWizardClient
      {...data}
      aiCalendarDebugEnabled={process.env.AI_CALENDAR_DEBUG === "true"}
      launchContext={launchContext}
      setupChooserHref={await getSchoolSetupStepPath(school, "schedule")}
    />
  );
}
