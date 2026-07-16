import "server-only";

import { canAccessAdminSection } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import {
  AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  AI_CALENDAR_PDF_STRATEGY,
  AI_CALENDAR_TEXT_STRATEGY,
  type CalendarAnalysisCacheKey,
} from "./aiCalendarAnalysisCache.server";
import {
  getOpenAiCalendarPdfModel,
  getOpenAiCalendarTextModel,
} from "./openAiCalendarAnalyzerUtils";

export type AiImportStatusAccess =
  | {
      ok: true;
      schoolId: string;
      cacheKeys: CalendarAnalysisCacheKey[];
      startedAt: number | null;
    }
  | {
      ok: false;
      status: number;
      body: {
        status: "failed" | "expired";
        reasonCode: string;
      };
    };

const PDF_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export async function resolveAiImportStatusAccess({
  school,
  pdfHash,
  startedAt,
}: {
  school: string;
  pdfHash: string | null;
  startedAt: string | null;
}): Promise<AiImportStatusAccess> {
  const normalizedHash = pdfHash?.trim().toLowerCase() || "";

  if (!PDF_HASH_PATTERN.test(normalizedHash)) {
    return {
      ok: false,
      status: 400,
      body: { status: "failed", reasonCode: "invalid_pdf_hash" },
    };
  }

  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    return {
      ok: false,
      status: 404,
      body: { status: "expired", reasonCode: "school_not_found" },
    };
  }

  const canImport = await canAccessAdminSection(schoolData.id, "calendar");

  if (!canImport) {
    return {
      ok: false,
      status: 403,
      body: { status: "failed", reasonCode: "permission_denied" },
    };
  }

  const parsedStartedAt = Number(startedAt || "");
  const pdfKey = {
    schoolId: schoolData.id,
    pdfHash: normalizedHash,
    strategy: AI_CALENDAR_PDF_STRATEGY,
    model: getOpenAiCalendarPdfModel(),
    version: AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  };
  const textKey = {
    schoolId: schoolData.id,
    pdfHash: normalizedHash,
    strategy: AI_CALENDAR_TEXT_STRATEGY,
    model: getOpenAiCalendarTextModel(),
    version: AI_CALENDAR_PROMPT_SCHEMA_VERSION,
  };

  return {
    ok: true,
    schoolId: schoolData.id,
    cacheKeys: [pdfKey, textKey],
    startedAt:
      Number.isFinite(parsedStartedAt) && parsedStartedAt > 0
        ? parsedStartedAt
        : null,
  };
}

export function logAiImportStatusDiagnostic({
  event,
  school,
  durationMs,
  reasonCode,
}: {
  event: string;
  school: string;
  durationMs: number;
  reasonCode?: string;
}) {
  console.info("AI calendar import status diagnostic", {
    event,
    school,
    durationMs,
    reasonCode,
  });
}
