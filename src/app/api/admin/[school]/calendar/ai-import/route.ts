import { NextResponse } from "next/server";
import { canAccessAdminSection } from "@/lib/auth/adminPermissions";
import type { AnalyzeCalendarPdfResult } from "@/lib/calendarWizard/aiImportTypes";
import { validateCalendarPdfFile } from "@/lib/calendarWizard/aiPdfValidation";
import { analyzeCalendarPdf } from "@/lib/calendarWizard/openAiCalendarAnalyzer.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

type RouteContext = {
  params: Promise<{ school: string }>;
};

function json(result: AnalyzeCalendarPdfResult, init?: ResponseInit) {
  return NextResponse.json(result, init);
}

export async function POST(request: Request, context: RouteContext) {
  const { school } = await context.params;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: schoolData } = await supabase
      .rpc("get_school_by_subdomain", {
        subdomain_input: school,
      })
      .single<{ id: string; name: string }>();

    if (!schoolData) {
      return json(
        {
          status: "validation_error",
          message: "School not found.",
        },
        { status: 404 }
      );
    }

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

    const formData = await request.formData();
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

    const validation = await validateCalendarPdfFile(upload);
    if (!validation.valid) {
      return json(
        {
          status: "validation_error",
          message: validation.message,
        },
        { status: 400 }
      );
    }

    const result = await analyzeCalendarPdf(upload);

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
      school,
      category: error instanceof Error ? error.name : "unknown",
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
