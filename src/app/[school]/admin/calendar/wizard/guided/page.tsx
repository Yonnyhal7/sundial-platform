import GuidedCalendarWizardClient from "../guided-calendar-wizard-client";
import { GUIDED_DRAFT_TYPE, loadCalendarWizardPageData } from "../page-data";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { parseCalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";

export default async function GuidedCalendarWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { school } = await params;
  const { from } = await searchParams;
  const data = await loadCalendarWizardPageData(school, GUIDED_DRAFT_TYPE);
  const launchContext = parseCalendarWizardLaunchContext(from);

  return (
    <GuidedCalendarWizardClient
      {...data}
      launchContext={launchContext}
      setupChooserHref={await getSchoolSetupStepPath(school, "schedule")}
    />
  );
}
