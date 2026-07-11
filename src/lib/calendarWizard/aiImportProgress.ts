export type AiImportProgressStage = {
  id:
    | "uploading"
    | "reading"
    | "dates"
    | "patterns"
    | "special-days"
    | "draft"
    | "review";
  label: string;
  description: string;
  min: number;
  max: number;
};

export const AI_IMPORT_PROGRESS_STAGES: AiImportProgressStage[] = [
  {
    id: "uploading",
    label: "Uploading PDF",
    description: "Securely sending your calendar for analysis.",
    min: 5,
    max: 15,
  },
  {
    id: "reading",
    label: "Reading calendar pages",
    description: "Reading text, legends, colors, and calendar layout.",
    min: 15,
    max: 30,
  },
  {
    id: "dates",
    label: "Detecting school dates",
    description: "Finding the first day, last day, and instructional dates.",
    min: 30,
    max: 45,
  },
  {
    id: "patterns",
    label: "Identifying schedule patterns",
    description: "Looking for patterns such as Brown/Gold, A/B, or regular schedules.",
    min: 45,
    max: 60,
  },
  {
    id: "special-days",
    label: "Finding holidays and special days",
    description: "Checking breaks, closures, finals, rallies, and minimum days.",
    min: 60,
    max: 75,
  },
  {
    id: "draft",
    label: "Building your calendar draft",
    description: "Organizing the detected dates into the Schedule Wizard.",
    min: 75,
    max: 88,
  },
  {
    id: "review",
    label: "Running final review checks",
    description: "Comparing counts and flagging anything that may need review.",
    min: 88,
    max: 94,
  },
];

export const AI_IMPORT_WAITING_THRESHOLD = 94;

export function getAiImportStageForProgress(progress: number) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  return (
    AI_IMPORT_PROGRESS_STAGES.find(
      (stage) => safeProgress >= stage.min && safeProgress < stage.max
    ) || AI_IMPORT_PROGRESS_STAGES[AI_IMPORT_PROGRESS_STAGES.length - 1]
  );
}

export function getEstimatedAiImportProgress(elapsedSeconds: number, previousProgress: number) {
  const elapsed = Math.max(0, elapsedSeconds);
  const anchors = [
    [0, 5],
    [2, 15],
    [6, 30],
    [12, 45],
    [20, 60],
    [30, 75],
    [45, 88],
    [60, 92],
  ] as const;

  let target: number = anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [time, progress] = anchors[index];
    const [previousTime, previousAnchorProgress] = anchors[index - 1];
    if (elapsed <= time) {
      const ratio = (elapsed - previousTime) / (time - previousTime);
      target = previousAnchorProgress + (progress - previousAnchorProgress) * ratio;
      break;
    }
    target = progress;
  }

  if (elapsed > 60) {
    target = Math.min(AI_IMPORT_WAITING_THRESHOLD, 92 + (elapsed - 60) * 0.04);
  }

  return Math.max(previousProgress, Math.min(AI_IMPORT_WAITING_THRESHOLD, Math.round(target)));
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
  return 100;
}

export function getAiImportProgressAfterError(previousProgress: number) {
  return previousProgress;
}

export function getAiImportProgressAfterRetry() {
  return 0;
}
