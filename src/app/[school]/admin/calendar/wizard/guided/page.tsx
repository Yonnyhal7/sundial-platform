import GuidedCalendarWizardClient from "../guided-calendar-wizard-client";
import { GUIDED_DRAFT_TYPE, loadCalendarWizardPageData } from "../page-data";

export default async function GuidedCalendarWizardPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const data = await loadCalendarWizardPageData(school, GUIDED_DRAFT_TYPE);

  return <GuidedCalendarWizardClient {...data} />;
}
