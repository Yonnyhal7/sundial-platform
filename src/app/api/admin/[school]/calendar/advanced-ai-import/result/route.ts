import { notFound } from "next/navigation";
import { isAdvancedAiImportEnabled } from "@/features/advanced-ai-import/constants/featureFlag";
import { GET as getBetaResult } from "../../ai-import/result/route";

export async function GET(request: Request, context: { params: Promise<{ school: string }> }) {
  if (!isAdvancedAiImportEnabled()) notFound();
  return getBetaResult(request, context);
}
