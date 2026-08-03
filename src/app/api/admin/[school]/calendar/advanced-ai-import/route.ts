import { notFound } from "next/navigation";
import { isAdvancedAiImportEnabled } from "@/features/advanced-ai-import/constants/featureFlag";
import { advancedImportLogger } from "@/features/advanced-ai-import/logging/logger";
import { POST as runBetaPipeline } from "../ai-import/route";
import { prepareImportSession } from "@/features/advanced-ai-import/services/ImportSessionService/prepareImportSession.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSchoolForSetup } from "@/lib/schools";
import { canAccessAdminSection } from "@/lib/auth/adminPermissions";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ school: string }> }) {
  if (!isAdvancedAiImportEnabled()) notFound();
  advancedImportLogger.info("Upload received");
  let sessionId: string | undefined;
  try {
    const { school } = await context.params;
    const schoolData = await getSchoolForSetup(school);
    const authDb = await createSupabaseServerClient();
    const { data: { user } } = await authDb.auth.getUser();
    if (!schoolData || !user || !await canAccessAdminSection(schoolData.id, "calendar")) {
      return Response.json({ status: "permission_error", message: "You do not have permission to import this calendar." }, { status: 403 });
    }
    const formData = await request.clone().formData();
    const upload = formData.get("calendarPdf");
    if (!(upload instanceof File)) return Response.json({ status: "validation_error", message: "Choose a PDF calendar to upload." }, { status: 400 });
    const session = await prepareImportSession({ db: createSupabaseServiceRoleClient(), schoolId: schoolData.id, userId: user.id, upload });
    sessionId = session.id;
    advancedImportLogger.info("Rendering complete", { sessionId });
    advancedImportLogger.info("Import started", { sessionId });
    const response = await runBetaPipeline(request, context);
    response.headers.set("x-sundial-advanced-import-session-id", sessionId);
    advancedImportLogger.info("GPT request complete", { sessionId, status: response.status });
    advancedImportLogger.info(response.ok ? "Validation finished" : "Import failed", { sessionId, status: response.status });
    return response;
  } catch (error) {
    sessionId = sessionId || (error as { importSessionId?: string }).importSessionId;
    const diagnostic = (error as { importDiagnostic?: { failingStep?: string; pageNumber?: number | null } }).importDiagnostic;
    const exception = error instanceof Error ? error.message : "Unknown rendering error";
    const location = diagnostic?.failingStep
      ? `${diagnostic.failingStep}${diagnostic.pageNumber ? ` on page ${diagnostic.pageNumber}` : ""}`
      : "workspace preparation";
    advancedImportLogger.error("Workspace preparation failed", { sessionId, currentStage: "rendering_pages", rendererImplementation: "pdf-parse/PDFParse.getScreenshot + @napi-rs/canvas", pageNumber: diagnostic?.pageNumber ?? null, failingStep: diagnostic?.failingStep || null, elapsedMs: null, importDiagnostic: diagnostic, message: exception });
    return Response.json({ status: "analysis_failed", message: `Advanced Import rendering failed during ${location}: ${exception}`, retryable: true, reasonCode: "workspace_preparation_failed", importSessionId: sessionId, diagnostic }, { status: 500, headers: sessionId ? { "x-sundial-advanced-import-session-id": sessionId } : undefined });
  }
}
