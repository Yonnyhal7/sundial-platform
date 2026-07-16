export type AiImportServerStage =
  | "preparing_upload"
  | "uploading_pdf"
  | "upload_received"
  | "validating_pdf"
  | "hashing_pdf"
  | "checking_cache"
  | "extracting_text"
  | "evaluating_text_quality"
  | "selecting_strategy"
  | "analyzing_text"
  | "validating_text_result"
  | "repairing_text_result"
  | "falling_back_to_pdf"
  | "preparing_visual_analysis"
  | "uploading_pdf_to_ai"
  | "analyzing_pdf"
  | "validating_pdf_result"
  | "repairing_pdf_result"
  | "generating_calendar_preview"
  | "saving_result"
  | "ready"
  | "confirmed_failed";

export type AiImportProgressStage = {
  id: AiImportServerStage;
  label: string;
  description: string;
  progress: number | null;
  start: number;
  end: number;
  indeterminate: boolean;
};

export const AI_IMPORT_STAGE_DETAILS: Record<AiImportServerStage, AiImportProgressStage> = {
  preparing_upload: {
    id: "preparing_upload",
    label: "Preparing upload",
    description: "Getting the PDF ready for analysis.",
    progress: 3,
    start: 0,
    end: 5,
    indeterminate: false,
  },
  uploading_pdf: {
    id: "uploading_pdf",
    label: "Uploading calendar PDF",
    description: "Securely sending your calendar for analysis.",
    progress: 8,
    start: 5,
    end: 12,
    indeterminate: false,
  },
  upload_received: {
    id: "upload_received",
    label: "Uploading calendar PDF",
    description: "Securely sending your calendar for analysis.",
    progress: 12,
    start: 5,
    end: 12,
    indeterminate: false,
  },
  validating_pdf: {
    id: "validating_pdf",
    label: "Checking PDF",
    description: "Making sure the upload is a readable calendar PDF.",
    progress: 15,
    start: 12,
    end: 18,
    indeterminate: false,
  },
  hashing_pdf: {
    id: "hashing_pdf",
    label: "Preparing upload",
    description: "Creating a secure fingerprint for this PDF.",
    progress: 18,
    start: 12,
    end: 18,
    indeterminate: false,
  },
  checking_cache: {
    id: "checking_cache",
    label: "Checking completed analyses",
    description: "Looking for an existing review for this exact PDF.",
    progress: 22,
    start: 18,
    end: 22,
    indeterminate: false,
  },
  extracting_text: {
    id: "extracting_text",
    label: "Reading calendar text",
    description: "Extracting readable text from the PDF pages.",
    progress: 30,
    start: 22,
    end: 30,
    indeterminate: false,
  },
  evaluating_text_quality: {
    id: "evaluating_text_quality",
    label: "Checking fast-analysis fit",
    description: "Checking whether the calendar can use fast analysis.",
    progress: 33,
    start: 30,
    end: 35,
    indeterminate: false,
  },
  selecting_strategy: {
    id: "selecting_strategy",
    label: "Choosing analysis strategy",
    description: "Selecting the best analysis path for this calendar layout.",
    progress: 35,
    start: 30,
    end: 35,
    indeterminate: false,
  },
  analyzing_text: {
    id: "analyzing_text",
    label: "Analyzing calendar details",
    description: "Sundial is reading dates, schedule names, and school-year patterns.",
    progress: null,
    start: 35,
    end: 65,
    indeterminate: true,
  },
  validating_text_result: {
    id: "validating_text_result",
    label: "Checking dates and schedule patterns",
    description: "Validating the fast analysis before opening review.",
    progress: 68,
    start: 65,
    end: 75,
    indeterminate: false,
  },
  repairing_text_result: {
    id: "repairing_text_result",
    label: "Correcting a formatting issue",
    description: "Sundial is repairing a structured response before validating again.",
    progress: null,
    start: 65,
    end: 75,
    indeterminate: true,
  },
  falling_back_to_pdf: {
    id: "falling_back_to_pdf",
    label: "Switching to deeper review",
    description: "This calendar uses visual schedule assignments. Sundial is switching to a deeper review.",
    progress: 75,
    start: 75,
    end: 75,
    indeterminate: false,
  },
  preparing_visual_analysis: {
    id: "preparing_visual_analysis",
    label: "Preparing visual calendar review",
    description: "Preparing the PDF for layout-aware analysis.",
    progress: 76,
    start: 75,
    end: 80,
    indeterminate: false,
  },
  uploading_pdf_to_ai: {
    id: "uploading_pdf_to_ai",
    label: "Preparing visual PDF review",
    description: "Uploading the original PDF for layout-aware analysis.",
    progress: 80,
    start: 75,
    end: 80,
    indeterminate: false,
  },
  analyzing_pdf: {
    id: "analyzing_pdf",
    label: "Analyzing visual calendar layout",
    description: "Sundial is checking layout, legends, colors, and date cells.",
    progress: null,
    start: 35,
    end: 78,
    indeterminate: true,
  },
  validating_pdf_result: {
    id: "validating_pdf_result",
    label: "Checking dates and schedule patterns",
    description: "Validating the deeper PDF analysis before opening review.",
    progress: 86,
    start: 82,
    end: 92,
    indeterminate: false,
  },
  repairing_pdf_result: {
    id: "repairing_pdf_result",
    label: "Correcting a formatting issue",
    description: "Sundial is repairing a structured response before validating again.",
    progress: null,
    start: 82,
    end: 92,
    indeterminate: true,
  },
  generating_calendar_preview: {
    id: "generating_calendar_preview",
    label: "Preparing your calendar preview",
    description: "Generating the review calendar from the completed analysis.",
    progress: 96,
    start: 92,
    end: 96,
    indeterminate: false,
  },
  saving_result: {
    id: "saving_result",
    label: "Preparing your calendar review",
    description: "Saving the completed analysis so the review screen can open.",
    progress: 99,
    start: 96,
    end: 99,
    indeterminate: false,
  },
  ready: {
    id: "ready",
    label: "Calendar analysis complete",
    description: "Sundial found calendar details and is opening the review screen.",
    progress: 100,
    start: 100,
    end: 100,
    indeterminate: false,
  },
  confirmed_failed: {
    id: "confirmed_failed",
    label: "Calendar analysis stopped",
    description: "Sundial could not complete this analysis.",
    progress: null,
    start: 0,
    end: 0,
    indeterminate: false,
  },
};

const ESTIMATED_STAGE_DURATION_MS: Partial<Record<AiImportServerStage, number>> = {
  analyzing_text: 75_000,
  repairing_text_result: 30_000,
  analyzing_pdf: 150_000,
  repairing_pdf_result: 45_000,
};

export function isAiImportServerStage(value: unknown): value is AiImportServerStage {
  return typeof value === "string" && value in AI_IMPORT_STAGE_DETAILS;
}

export function getAiImportStageDetails(stage: AiImportServerStage) {
  return AI_IMPORT_STAGE_DETAILS[stage];
}

export function getAiImportStageSequence(stage: AiImportServerStage) {
  return Object.keys(AI_IMPORT_STAGE_DETAILS).indexOf(stage);
}

export function getAiImportEstimatedProgress({
  stage,
  previousProgress,
  stageStartedAt,
  now = Date.now(),
  expectedDurationMs,
}: {
  stage: AiImportServerStage;
  previousProgress: number;
  stageStartedAt?: number | null;
  now?: number;
  expectedDurationMs?: number | null;
}) {
  const details = getAiImportStageDetails(stage);
  if (stage === "ready") {
    return { progress: 100, estimated: false, indeterminate: false };
  }
  if (stage === "confirmed_failed") {
    return {
      progress: previousProgress,
      estimated: false,
      indeterminate: false,
    };
  }

  const baseline = Math.max(previousProgress, details.progress ?? details.start);
  const expected = expectedDurationMs ?? ESTIMATED_STAGE_DURATION_MS[stage] ?? null;
  if (!details.indeterminate || !stageStartedAt || !expected) {
    return {
      progress: baseline,
      estimated: false,
      indeterminate: details.indeterminate,
    };
  }

  const elapsed = Math.max(0, now - stageStartedAt);
  const stageFraction = Math.min(elapsed / expected, 0.9);
  const estimatedProgress = Math.round(
    details.start + (details.end - details.start) * stageFraction
  );

  return {
    progress: Math.max(baseline, Math.min(details.end - 1, estimatedProgress)),
    estimated: true,
    indeterminate: false,
  };
}

export function getAiImportLongRunningMessage(elapsedSeconds: number) {
  if (elapsedSeconds >= 120) {
    return "Still working. Complex PDF layouts can take a couple of minutes.";
  }

  if (elapsedSeconds >= 60) {
    return "This calendar is taking a little longer than usual, but analysis is still running.";
  }

  if (elapsedSeconds >= 30) {
    return "Still working. Detailed calendars may take up to a minute.";
  }

  return "You can keep waiting while Sundial reviews the calendar.";
}

export function getAiImportProgressAfterSuccess() {
  return AI_IMPORT_STAGE_DETAILS.ready.progress || 100;
}

export function getAiImportProgressAfterRetry() {
  return 0;
}
