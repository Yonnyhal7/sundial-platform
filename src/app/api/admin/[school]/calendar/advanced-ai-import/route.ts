import { notFound } from "next/navigation";
import { isAdvancedAiImportEnabled } from "@/features/advanced-ai-import/constants/featureFlag";
import { advancedImportLogger } from "@/features/advanced-ai-import/logging/logger";
import { POST as runBetaPipeline } from "../ai-import/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ school: string }> }) {
  if (!isAdvancedAiImportEnabled()) notFound();
  advancedImportLogger.info("Upload received");
  advancedImportLogger.info("Import started");
  const response = await runBetaPipeline(request, context);
  advancedImportLogger.info("GPT request complete", { status: response.status });
  advancedImportLogger.info(response.ok ? "Validation finished" : "Import failed", { status: response.status });
  return response;
}
