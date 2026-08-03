import { notFound } from "next/navigation";
import { isAdvancedAiImportEnabled } from "@/features/advanced-ai-import/constants/featureFlag";
import { GET as getBetaStatus } from "../../ai-import/status/route";

export async function GET(request: Request, context: { params: Promise<{ school: string }> }) {
  if (!isAdvancedAiImportEnabled()) notFound();
  return getBetaStatus(request, context);
}
