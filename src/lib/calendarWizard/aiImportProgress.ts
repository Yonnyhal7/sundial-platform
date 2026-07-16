export type AiImportServerStage =
  | "upload_received"
  | "hashing_pdf"
  | "checking_cache"
  | "extracting_text"
  | "evaluating_text_quality"
  | "analyzing_text"
  | "validating_text_result"
  | "repairing_text_result"
  | "falling_back_to_pdf"
  | "uploading_pdf_to_ai"
  | "analyzing_pdf"
  | "validating_pdf_result"
  | "repairing_pdf_result"
  | "saving_result"
  | "ready"
  | "confirmed_failed";

export type AiImportProgressStage = {
  id: AiImportServerStage;
  label: string;
  description: string;
  progress: number | null;
  indeterminate: boolean;
};

export const AI_IMPORT_STAGE_DETAILS: Record<AiImportServerStage, AiImportProgressStage> = {
  upload_received: {
    id: "upload_received",
    label: "Uploading calendar PDF",
    description: "Securely sending your calendar for analysis.",
    progress: 10,
    indeterminate: false,
  },
  hashing_pdf: {
    id: "hashing_pdf",
    label: "Preparing upload",
    description: "Creating a secure fingerprint for this PDF.",
    progress: 15,
    indeterminate: false,
  },
  checking_cache: {
    id: "checking_cache",
    label: "Checking completed analyses",
    description: "Looking for an existing review for this exact PDF.",
    progress: 20,
    indeterminate: false,
  },
  extracting_text: {
    id: "extracting_text",
    label: "Reading calendar text",
    description: "Extracting readable text from the PDF pages.",
    progress: 30,
    indeterminate: false,
  },
  evaluating_text_quality: {
    id: "evaluating_text_quality",
    label: "Checking fast-analysis fit",
    description: "Checking whether the calendar can use fast analysis.",
    progress: 38,
    indeterminate: false,
  },
  analyzing_text: {
    id: "analyzing_text",
    label: "Analyzing calendar details",
    description: "Sundial is reading dates, schedule names, and school-year patterns.",
    progress: null,
    indeterminate: true,
  },
  validating_text_result: {
    id: "validating_text_result",
    label: "Checking dates and schedule patterns",
    description: "Validating the fast analysis before opening review.",
    progress: 62,
    indeterminate: false,
  },
  repairing_text_result: {
    id: "repairing_text_result",
    label: "Correcting a formatting issue",
    description: "Sundial is repairing a structured response before validating again.",
    progress: null,
    indeterminate: true,
  },
  falling_back_to_pdf: {
    id: "falling_back_to_pdf",
    label: "Performing deeper PDF review",
    description: "This calendar relies on visual layout. Sundial is performing a deeper review.",
    progress: 68,
    indeterminate: false,
  },
  uploading_pdf_to_ai: {
    id: "uploading_pdf_to_ai",
    label: "Preparing visual PDF review",
    description: "Uploading the original PDF for layout-aware analysis.",
    progress: 72,
    indeterminate: false,
  },
  analyzing_pdf: {
    id: "analyzing_pdf",
    label: "Analyzing visual calendar layout",
    description: "Sundial is checking layout, legends, colors, and date cells.",
    progress: null,
    indeterminate: true,
  },
  validating_pdf_result: {
    id: "validating_pdf_result",
    label: "Checking dates and schedule patterns",
    description: "Validating the deeper PDF analysis before opening review.",
    progress: 88,
    indeterminate: false,
  },
  repairing_pdf_result: {
    id: "repairing_pdf_result",
    label: "Correcting a formatting issue",
    description: "Sundial is repairing a structured response before validating again.",
    progress: null,
    indeterminate: true,
  },
  saving_result: {
    id: "saving_result",
    label: "Preparing your calendar review",
    description: "Saving the completed analysis so the review screen can open.",
    progress: 96,
    indeterminate: false,
  },
  ready: {
    id: "ready",
    label: "Calendar analysis complete",
    description: "Sundial found calendar details and is opening the review screen.",
    progress: 100,
    indeterminate: false,
  },
  confirmed_failed: {
    id: "confirmed_failed",
    label: "Calendar analysis stopped",
    description: "Sundial could not complete this analysis.",
    progress: null,
    indeterminate: false,
  },
};

export function isAiImportServerStage(value: unknown): value is AiImportServerStage {
  return typeof value === "string" && value in AI_IMPORT_STAGE_DETAILS;
}

export function getAiImportStageDetails(stage: AiImportServerStage) {
  return AI_IMPORT_STAGE_DETAILS[stage];
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
