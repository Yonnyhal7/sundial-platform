import AiCalendarWizardClient from "../ai-calendar-wizard-client";
import { AI_DRAFT_TYPE, loadCalendarWizardPageData } from "../page-data";

export default async function AiCalendarWizardPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const data = await loadCalendarWizardPageData(school, AI_DRAFT_TYPE);

  return <AiCalendarWizardClient {...data} />;
}
