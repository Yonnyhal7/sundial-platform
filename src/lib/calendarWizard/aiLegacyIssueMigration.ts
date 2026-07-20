import type { AiCalendarImportResult, AiImportDraftMetadata, AiImportWarningResolution } from "./aiImportTypes";
import { normalizePersistedAiCalendarImportResult } from "./aiCalendarImportNormalizer";
import { AI_CALENDAR_ANALYSIS_VERSION, AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION } from "./aiCalendarAnalysisVersion";
import {
  isDefaultScheduleAlias,
  isRegularScheduleInferenceResolutionMessage,
} from "./scheduleIdentity";

const LEGACY_DEFAULT_CODE = "unknown_pattern_schedule_reference";

function arrayField(value: unknown, key: string) {
  if (!value || typeof value !== "object") return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === "string") : [];
}

function concreteUnknownScheduleReference(warning: { message: string } & Record<string, unknown>) {
  const payloadReferences = [
    ...arrayField(warning, "scheduleIds"),
    ...arrayField(warning, "scheduleKeys"),
    ...arrayField(warning, "sourceLabels"),
    ...arrayField(warning, "dates"),
    ...(typeof warning.scheduleId === "string" ? [warning.scheduleId] : []),
    ...(typeof warning.scheduleTempId === "string" ? [warning.scheduleTempId] : []),
    ...(typeof warning.canonicalKey === "string" ? [warning.canonicalKey] : []),
  ].filter((value) => value.trim() && !isDefaultScheduleAlias(value));
  const named = warning.message.match(/(?:not listed|unknown|referenced)\s*:\s*([^.;]+)/i)?.[1]?.trim();
  return payloadReferences.length > 0 || Boolean(named && !isDefaultScheduleAlias(named));
}

function resultHasConflictingAssignments(result: AiCalendarImportResult) {
  const byDate = new Map<string, string>();
  for (const assignment of result.datedScheduleAssignments || []) {
    const existing = byDate.get(assignment.date);
    if (existing && existing !== assignment.scheduleTempId) return true;
    byDate.set(assignment.date, assignment.scheduleTempId);
  }
  return false;
}

function resultHasRegularSchedule(result: AiCalendarImportResult) {
  const regularIds = new Set(result.detectedSchedules.filter((schedule) =>
    schedule.category === "regular" ||
    isDefaultScheduleAlias(schedule.tempId) ||
    isDefaultScheduleAlias(schedule.detectedName)
  ).map((schedule) => schedule.tempId));
  return result.pattern.scheduleTempIds.some((id) => regularIds.has(id) || isDefaultScheduleAlias(id));
}

export function normalizeUnknownScheduleReferences(result: AiCalendarImportResult) {
  const removedEmptyIssueCodes: string[] = [];
  const canRemoveEmpty = resultHasRegularSchedule(result) && !resultHasConflictingAssignments(result);
  const warnings = result.warnings.filter((warning) => {
    if (warning.code !== LEGACY_DEFAULT_CODE || !canRemoveEmpty) return true;
    if (concreteUnknownScheduleReference(warning as typeof warning & Record<string, unknown>)) return true;
    removedEmptyIssueCodes.push(warning.code);
    return false;
  });
  return {
    result: warnings.length === result.warnings.length ? result : { ...result, warnings },
    changed: warnings.length !== result.warnings.length,
    diagnostics: {
      removedEmptyIssueCodes: [...new Set(removedEmptyIssueCodes)].sort(),
      normalizedUnknownScheduleReferences: result.warnings.filter((warning) => warning.code === LEGACY_DEFAULT_CODE).length,
    },
  };
}

export type AiLegacyIssueMigrationDiagnostics = {
  draftAnalysisVersion?: string;
  currentAnalysisVersion: string;
  migratedIssueCodes: string[];
  removedIssueCodes: string[];
  preservedUserResolutionCodes: string[];
  staleAnalyzerWarningsReplaced: boolean;
};

function hasConflictingAssignments(metadata: AiImportDraftMetadata) {
  const byDate = new Map<string, string>();
  for (const assignment of metadata.result?.datedScheduleAssignments || []) {
    const existing = byDate.get(assignment.date);
    if (existing && existing !== assignment.scheduleTempId) return true;
    byDate.set(assignment.date, assignment.scheduleTempId);
  }
  return false;
}

function refersOnlyToDefaultSchedule(message: string) {
  if (isRegularScheduleInferenceResolutionMessage(message)) return true;
  const named = message.match(/(?:not listed|unknown|referenced)\s*:\s*([^.;]+)/i)?.[1]?.trim();
  return Boolean(named && isDefaultScheduleAlias(named));
}

function regularScheduleResolved(metadata: AiImportDraftMetadata) {
  const result = metadata.result;
  if (!result) return false;
  const regularIds = new Set(
    result.detectedSchedules
      .filter((schedule) =>
        schedule.category === "regular" ||
        isDefaultScheduleAlias(schedule.tempId) ||
        isDefaultScheduleAlias(schedule.detectedName)
      )
      .map((schedule) => schedule.tempId)
  );
  if (result.pattern.scheduleTempIds.some((id) => regularIds.has(id) || isDefaultScheduleAlias(id))) {
    return true;
  }
  return metadata.resolutions.some((resolution) =>
    regularIds.has(resolution.tempId) &&
    Boolean(resolution.matchedExistingScheduleId || resolution.status === "matched_automatically" || resolution.status === "matched_by_admin")
  );
}

function isExplicitUserResolution(resolution: AiImportWarningResolution) {
  return Boolean(
    resolution.reviewedBy || resolution.reviewedAt ||
    ["acknowledged", "manually_resolved", "edited_manually", "accepted_suggestion", "kept_original"].includes(resolution.status)
  );
}

export function migrateLegacyAiImportMetadata(metadata: AiImportDraftMetadata): {
  metadata: AiImportDraftMetadata;
  diagnostics: AiLegacyIssueMigrationDiagnostics;
  changed: boolean;
} {
  const originalWarnings = metadata.result?.warnings || metadata.warnings || [];
  const hasUnresolvedLegacyResolution = (metadata.warningResolutions || []).some((resolution) =>
    (resolution.issueCode || resolution.code) === LEGACY_DEFAULT_CODE &&
    (resolution.status === "unresolved" || resolution.status === "unreviewed")
  );
  const migratableCodes = new Set(
    originalWarnings
      .filter((warning) =>
        warning.code === LEGACY_DEFAULT_CODE &&
        refersOnlyToDefaultSchedule(warning.message) &&
        regularScheduleResolved(metadata) &&
        !hasConflictingAssignments(metadata) &&
        (warning.severity !== "info" ||
          metadata.analysisVersion !== AI_CALENDAR_ANALYSIS_VERSION ||
          hasUnresolvedLegacyResolution)
      )
      .map((warning) => warning.code)
  );
  const versionStale = metadata.analysisVersion !== AI_CALENDAR_ANALYSIS_VERSION ||
    metadata.issueSchemaVersion !== AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION;
  const shouldNormalize = versionStale || migratableCodes.size > 0;
  const result = metadata.result && shouldNormalize
    ? normalizePersistedAiCalendarImportResult(metadata.result)
    : metadata.result;
  const canonicalResult = result && migratableCodes.has(LEGACY_DEFAULT_CODE)
    ? {
        ...result,
        warnings: [
          ...result.warnings.filter((warning) => warning.code !== LEGACY_DEFAULT_CODE),
          {
            code: LEGACY_DEFAULT_CODE,
            severity: "info" as const,
            message: "Sundial assigned standard instructional days to the regular schedule.",
          },
        ],
      }
    : result;
  const normalizedUnknowns = canonicalResult
    ? normalizeUnknownScheduleReferences(canonicalResult)
    : { result: canonicalResult, changed: false, diagnostics: { removedEmptyIssueCodes: [] as string[], normalizedUnknownScheduleReferences: 0 } };
  const finalResult = normalizedUnknowns.result;
  const currentCodes = new Set((finalResult?.warnings || []).map((warning) => warning.code));
  const warningResolutions = (metadata.warningResolutions || []).filter((resolution) =>
    isExplicitUserResolution(resolution) &&
    Boolean(resolution.issueCode ? currentCodes.has(resolution.issueCode) : currentCodes.has(resolution.code))
  );
  const next: AiImportDraftMetadata = {
    ...metadata,
    result: finalResult,
    warnings: finalResult?.warnings || [],
    warningResolutions,
    analysisVersion: shouldNormalize ? AI_CALENDAR_ANALYSIS_VERSION : metadata.analysisVersion,
    issueSchemaVersion: AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION,
  };
  const changed = shouldNormalize || normalizedUnknowns.changed ||
    warningResolutions.length !== (metadata.warningResolutions || []).length ||
    JSON.stringify(metadata.warnings || []) !== JSON.stringify(next.warnings || []);
  return {
    metadata: next,
    changed,
    diagnostics: {
      draftAnalysisVersion: metadata.analysisVersion,
      currentAnalysisVersion: AI_CALENDAR_ANALYSIS_VERSION,
      migratedIssueCodes: [...migratableCodes].sort(),
      removedIssueCodes: [...new Set([...originalWarnings
        .map((warning) => warning.code)
        .filter((code) => !currentCodes.has(code))
        .sort(), ...normalizedUnknowns.diagnostics.removedEmptyIssueCodes])].sort(),
      preservedUserResolutionCodes: warningResolutions.map((resolution) => resolution.issueCode || resolution.code).sort(),
      staleAnalyzerWarningsReplaced: shouldNormalize,
    },
  };
}

export function replaceAiImportWithFreshAnalysis(
  previous: AiImportDraftMetadata | null | undefined,
  fresh: AiImportDraftMetadata
) {
  const previousWarnings = previous?.result?.warnings || previous?.warnings || [];
  const freshWarnings = fresh.result?.warnings || [];
  const preserved = (previous?.warningResolutions || []).filter((resolution) =>
    isExplicitUserResolution(resolution) &&
    freshWarnings.some((freshWarning) =>
      freshWarning.code === (resolution.issueCode || resolution.code) &&
      previousWarnings.some((previousWarning) =>
        previousWarning.code === freshWarning.code &&
        previousWarning.message === freshWarning.message
      )
    )
  );
  const previousUserScheduleResolutions = new Map(
    (previous?.resolutions || [])
      .filter((resolution) => resolution.status === "matched_by_admin")
      .map((resolution) => [resolution.normalizedName, resolution])
  );
  const resolutions = fresh.resolutions.map((resolution) => {
    const previousResolution = previousUserScheduleResolutions.get(resolution.normalizedName);
    return previousResolution
      ? {
          ...resolution,
          matchedExistingScheduleId: previousResolution.matchedExistingScheduleId,
          status: previousResolution.status,
          calendarColor: previousResolution.calendarColor,
          setupChoice: previousResolution.setupChoice,
          needsSetup: previousResolution.needsSetup,
        }
      : resolution;
  });
  return {
    ...fresh,
    resolutions,
    warnings: fresh.result?.warnings || [],
    warningResolutions: preserved,
    analysisVersion: AI_CALENDAR_ANALYSIS_VERSION,
    issueSchemaVersion: AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION,
  } satisfies AiImportDraftMetadata;
}
