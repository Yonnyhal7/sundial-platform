import { NextResponse } from "next/server";
import { canAccessAdminSection } from "@/lib/auth/adminPermissions";
import type { AnalyzeCalendarPdfResult } from "@/lib/calendarWizard/aiImportTypes";
import { validateCalendarPdfFile } from "@/lib/calendarWizard/aiPdfValidation";
import { analyzeCalendarPdf } from "@/lib/calendarWizard/openAiCalendarAnalyzer.server";
import { getSchoolForSetup } from "@/lib/schools";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ school: string }>;
};

function json(result: AnalyzeCalendarPdfResult, init?: ResponseInit) {
  return NextResponse.json(result, init);
}

function logAiImportRouteDiagnostic({
  level = "info",
  event,
  requestId,
  school,
  durationMs,
  status,
  fileSize,
  fileType,
}: {
  level?: "info" | "warn";
  event: string;
  requestId: string;
  school: string;
  durationMs: number;
  status?: string;
  fileSize?: number;
  fileType?: string;
}) {
  const payload = {
    event,
    requestId,
    school,
    durationMs,
    status,
    fileSize,
    fileType,
  };

  if (level === "warn") {
    console.warn("AI calendar import route diagnostic", payload);
    return;
  }

  console.info("AI calendar import route diagnostic", payload);
}

export async function POST(request: Request, context: RouteContext) {
  const { school } = await context.params;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    logAiImportRouteDiagnostic({
      event: "request_received",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    const schoolData = await getSchoolForSetup(school);

    if (!schoolData) {
      return json(
        {
          status: "validation_error",
          message: "School not found.",
        },
        { status: 404 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "school_resolved",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    const canImport = await canAccessAdminSection(schoolData.id, "calendar");
    if (!canImport) {
      return json(
        {
          status: "permission_error",
          message: "You do not have permission to import this calendar.",
        },
        { status: 403 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "permission_checked",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "formdata_parse_failed",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
      });
      return json(
        {
          status: "validation_error",
          message: "Sundial could not read the uploaded PDF. Please choose the file again and retry.",
        },
        { status: 400 }
      );
    }
    const upload = formData.get("calendarPdf");

    if (!(upload instanceof File)) {
      return json(
        {
          status: "validation_error",
          message: "Please upload a PDF calendar smaller than 20 MB.",
        },
        { status: 400 }
      );
    }
    logAiImportRouteDiagnostic({
      event: "upload_received",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });

    let validation;
    try {
      validation = await validateCalendarPdfFile(upload);
    } catch {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "pdf_validation_failed",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
        fileSize: upload.size,
        fileType: upload.type || "unknown",
      });
      return json(
        {
          status: "validation_error",
          message: "Sundial could not read the uploaded PDF. Please choose the file again and retry.",
        },
        { status: 400 }
      );
    }

    if (!validation.valid) {
      logAiImportRouteDiagnostic({
        level: "warn",
        event: "upload_rejected",
        requestId,
        school,
        durationMs: Date.now() - startedAt,
        status: "validation_error",
        fileSize: upload.size,
        fileType: upload.type || "unknown",
      });
      return json(
        {
          status: "validation_error",
          message: validation.message,
        },
        { status: 400 }
      );
    }

    logAiImportRouteDiagnostic({
      event: "analysis_started",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });
    const result = await analyzeCalendarPdf(upload);
    logAiImportRouteDiagnostic({
      level: result.status === "success" ? "info" : "warn",
      event: "analysis_finished",
      requestId,
      school,
      durationMs: Date.now() - startedAt,
      status: result.status,
      fileSize: upload.size,
      fileType: upload.type || "unknown",
    });

    if (result.status === "success") {
      return json(result);
    }

    const status =
      result.status === "configuration_error"
        ? 503
        : result.status === "rate_limited"
          ? 429
          : result.status === "analysis_failed"
            ? 422
            : 500;

    return json(result, { status });
  } catch (error) {
    console.error("AI calendar import route error:", {
      requestId,
      school,
      category: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    return json(
      {
        status: "server_error",
        message: "Sundial could not analyze this PDF yet. Please continue manually.",
      },
      { status: 500 }
    );
  }
}
