"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  getSchoolSetupStepPath,
  requireAdminSectionAccess,
} from "@/lib/auth/adminPermissions";
import { compareDateStrings, isDateString } from "@/lib/calendarWizard/dateUtils";
import {
  AI_CALENDAR_WIZARD_DRAFT_TYPE,
  GUIDED_CALENDAR_WIZARD_DRAFT_TYPE,
  LEGACY_CALENDAR_WIZARD_DRAFT_TYPE,
  getCalendarWizardFlowForDraft,
  mergeAiCalendarIssueResolutionWithRetry,
  serializeCalendarWizardDraft,
  type CalendarWizardDraftType,
  type CalendarWizardDraftRecord,
  type CalendarWizardStoredData,
} from "@/lib/calendarWizard/draftPersistence";
import { generateSchoolYearCalendar } from "@/lib/calendarWizard/generateSchoolYearCalendar";
import {
  AI_CALENDAR_ANALYSIS_VERSION,
  AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION,
} from "@/lib/calendarWizard/aiCalendarAnalysisVersion";
import { normalizePersistedAiCalendarImportResult } from "@/lib/calendarWizard/aiCalendarImportNormalizer";
import {
  buildAiCalendarDebugSnapshot,
  type AiCalendarDebugResolutionEvent,
  type AiCalendarDebugSnapshot,
} from "@/lib/calendarWizard/aiCalendarDebug";
import {
  computeAssignmentDigest,
  computeCalendarClassificationDigest,
  computeDatedScheduleAssignmentDigest,
  findAssignmentDigestDifferences,
} from "@/lib/calendarWizard/assignmentDigest";
import { getInstructionalDayCountReviewState } from "@/lib/calendarWizard/instructionalDayCountReview";
import {
  validateAiCalendarImportResult,
  type AiImportWarningResolution,
} from "@/lib/calendarWizard/aiImportTypes";
import { canonicalScheduleName } from "@/lib/calendarWizard/scheduleIdentity";
import {
  buildAiPreviewConfig,
  getUnreviewedRequiredAssignmentDates,
} from "@/lib/calendarWizard/aiImportPreview";
import { mapGeneratedCalendarDaysToRows } from "@/lib/calendarWizard/persistence";
import {
  collectReferencedRemovedScheduleIds,
  collectUnmappedTemporaryScheduleIds,
  getUnresolvedBlockingReviewIssues,
  logCalendarWarningClassification,
  normalizeAndDeduplicateReviewIssues,
  planAiSchedulePersistence,
  resolveAiScheduleReferences,
  validateAiCalendarRpcRows,
  type ExistingScheduleForAiPersistence,
} from "@/lib/calendarWizard/aiQuickSetupPersistence";
import type {
  CalendarGenerationSummary,
  CalendarGenerationWarning,
  CalendarWizardConfig,
  Weekday,
} from "@/lib/calendarWizard/types";
import type { CalendarWizardLaunchContext } from "@/lib/calendarWizard/launchContext";
import { completeSetupCalendarStep } from "@/lib/setupCalendarCompletion";
import { getSchoolForSetup } from "@/lib/schools";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  collectStoredDraftScheduleIds,
  findForeignScheduleIds,
} from "@/lib/calendarWizard/tenantIsolation";

export type GenerateCalendarActionInput = {
  config: CalendarWizardConfig;
  replaceExisting?: boolean;
  launchContext?: CalendarWizardLaunchContext | null;
};

export type CalendarCompletionSummary = {
  schoolYearLabel: string;
  startDate: string;
  endDate: string;
  insertedRowCount: number;
  instructionalDayCount: number;
  noSchoolWeekdayCount: number;
  specialInstructionalDayCount: number;
  warningCount: number;
  warnings: CalendarGenerationWarning[];
  schedulesCreated?: Array<{ id: string; name: string }>;
  matchedScheduleCount?: number;
  schedulesNeedingTimes?: Array<{ id: string; name: string }>;
  warningsRemaining?: number;
};

export type GenerateCalendarActionResult =
  | {
      status: "success";
      summary: CalendarCompletionSummary;
      redirectTo?: string;
    }
  | {
      status: "replacement_required";
      existingCount: number;
      firstExistingDate: string | null;
      lastExistingDate: string | null;
      summary: CalendarGenerationSummary;
    }
  | {
      status: "validation_error";
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | {
      status: "permission_error";
      message: string;
    }
  | {
      status: "schedule_conflict" | "draft_conflict";
      message: string;
    }
  | {
      status: "server_error";
      message: string;
      severity?: "high";
      code?: "calendar_assignment_digest_mismatch";
    };

export type CreateAiCalendarFromDraftActionInput = {
  replaceExisting?: boolean;
  expectedDraftUpdatedAt?: string | null;
  launchContext?: CalendarWizardLaunchContext | null;
  previewAssignmentDigest?: string;
  previewClassificationDigest?: string;
  acknowledgedIssueCodes?: string[];
};

export type AiCalendarDebugSnapshotActionResult =
  | { status: "success"; snapshot: AiCalendarDebugSnapshot }
  | { status: "disabled" | "not_found" | "validation_error"; message: string };

function aiCalendarDebugEnabled() {
  return process.env.AI_CALENDAR_DEBUG === "true";
}

function logAiCalendarDebug(event: string, metadata: Record<string, unknown>) {
  if (!aiCalendarDebugEnabled()) return;
  console.info("AI calendar debug", { event, ...metadata });
}

export type CalendarWizardDraftActionResult =
  | {
      status: "success";
      draft: CalendarWizardDraftRecord | null;
      mergeRetried?: boolean;
    }
  | {
      status: "draft_conflict";
      message: string;
      draft: CalendarWizardDraftRecord | null;
    }
  | {
      status: "validation_error" | "permission_error" | "server_error";
      message: string;
    };

export type GuidedScheduleNameActionResult =
  | {
      status: "success";
      schedule?: {
        id: string;
        name: string;
        type: null;
        calendarColor: null;
        active: true;
        setupStatus: "needs_times";
        periodCount: 0;
        firstStartTime: null;
        lastEndTime: null;
      };
    }
  | {
      status: "validation_error" | "permission_error" | "server_error" | "assigned";
      message: string;
    };

function normalizeScheduleName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function guidedScheduleNameExists(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  name: string,
  exceptScheduleId?: string
) {
  const { data, error } = await supabase
    .from("schedules")
    .select("id, schedule_name")
    .eq("school_id", schoolId)
    .returns<Array<{ id: string; schedule_name: string }>>();

  if (error) throw error;
  const normalized = name.toLocaleLowerCase("en-US");
  return (data || []).some(
    (schedule) =>
      schedule.id !== exceptScheduleId &&
      normalizeScheduleName(schedule.schedule_name).toLocaleLowerCase("en-US") === normalized
  );
}

export async function createGuidedScheduleName(
  school: string,
  rawName: string
): Promise<GuidedScheduleNameActionResult> {
  const name = normalizeScheduleName(rawName);
  if (!name || name.length > 80) {
    return { status: "validation_error", message: "Enter a schedule name using 80 characters or fewer." };
  }

  try {
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    if (await guidedScheduleNameExists(adminUser.supabase, schoolData.id, name)) {
      return { status: "validation_error", message: "A schedule with this name already exists in this school." };
    }

    const { data, error } = await adminUser.supabase
      .from("schedules")
      .insert({
        school_id: schoolData.id,
        schedule_name: name,
        schedule_type: null,
        calendar_color: null,
        active: true,
        setup_status: "needs_times",
      })
      .select("id, schedule_name")
      .single<{ id: string; schedule_name: string }>();

    if (error || !data) {
      console.error("Create guided schedule name error:", JSON.stringify(error, null, 2));
      return { status: "server_error", message: "Sundial could not create that schedule name." };
    }

    revalidatePath(`/${school}/admin/schedules`);
    return {
      status: "success",
      schedule: {
        id: data.id,
        name: data.schedule_name,
        type: null,
        calendarColor: null,
        active: true,
        setupStatus: "needs_times",
        periodCount: 0,
        firstStartTime: null,
        lastEndTime: null,
      },
    };
  } catch (error) {
    console.error("Create guided schedule name error:", error);
    return { status: "permission_error", message: "You cannot create schedules for this school." };
  }
}

export async function renameGuidedScheduleName(
  school: string,
  scheduleId: string,
  rawName: string
): Promise<GuidedScheduleNameActionResult> {
  if (!isUuid(scheduleId)) {
    return { status: "validation_error", message: "That schedule is not valid." };
  }
  const name = normalizeScheduleName(rawName);
  if (!name || name.length > 80) {
    return { status: "validation_error", message: "Enter a schedule name using 80 characters or fewer." };
  }

  try {
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    if (await guidedScheduleNameExists(adminUser.supabase, schoolData.id, name, scheduleId)) {
      return { status: "validation_error", message: "A schedule with this name already exists in this school." };
    }
    const { data, error } = await adminUser.supabase
      .from("schedules")
      .update({ schedule_name: name, updated_at: new Date().toISOString() })
      .eq("id", scheduleId)
      .eq("school_id", schoolData.id)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      return { status: "permission_error", message: "That schedule is not available in this school." };
    }
    revalidatePath(`/${school}/admin/schedules`);
    return { status: "success" };
  } catch (error) {
    console.error("Rename guided schedule error:", error);
    return { status: "server_error", message: "Sundial could not rename that schedule." };
  }
}

export async function deleteUnusedGuidedScheduleName(
  school: string,
  scheduleId: string
): Promise<GuidedScheduleNameActionResult> {
  if (!isUuid(scheduleId)) {
    return { status: "validation_error", message: "That schedule is not valid." };
  }
  try {
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    const { count, error: assignmentError } = await adminUser.supabase
      .from("calendar_days")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolData.id)
      .or(`schedule_id.eq.${scheduleId},base_schedule_id.eq.${scheduleId}`);
    if (assignmentError) {
      return { status: "server_error", message: "Sundial could not check schedule assignments." };
    }
    if ((count || 0) > 0) {
      return { status: "assigned", message: "This schedule is already assigned to calendar dates." };
    }

    const { data, error } = await adminUser.supabase
      .from("schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("school_id", schoolData.id)
      .eq("setup_status", "needs_times")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      return { status: "permission_error", message: "Only unused name-only schedules can be deleted here." };
    }
    revalidatePath(`/${school}/admin/schedules`);
    return { status: "success" };
  } catch (error) {
    console.error("Delete guided schedule error:", error);
    return { status: "server_error", message: "Sundial could not delete that schedule." };
  }
}

async function getCalendarDraftSchoolContext(school: string) {
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  const adminUser = await requireAdminSectionAccess(schoolData.id, "calendar", school);
  return { schoolData, adminUser };
}

function safeDraftRecord(row: {
  id: string;
  school_id: string;
  draft_type: string;
  school_year_label: string | null;
  wizard_data: unknown;
  created_at: string;
  updated_at: string;
}): CalendarWizardDraftRecord | null {
  const serialized = serializeCalendarWizardDraft(row.wizard_data);
  if (!serialized) return null;

  return {
    ...row,
    wizard_data: serialized.data,
  };
}

function normalizeDraftType(draftType?: CalendarWizardDraftType): CalendarWizardDraftType {
  return draftType === AI_CALENDAR_WIZARD_DRAFT_TYPE ||
    draftType === GUIDED_CALENDAR_WIZARD_DRAFT_TYPE ||
    draftType === LEGACY_CALENDAR_WIZARD_DRAFT_TYPE
    ? draftType
    : GUIDED_CALENDAR_WIZARD_DRAFT_TYPE;
}

function expectedFlowForDraftType(draftType: CalendarWizardDraftType) {
  return draftType === AI_CALENDAR_WIZARD_DRAFT_TYPE ? "ai" : "guided";
}

async function storedDraftSchedulesBelongToSchool(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  schoolId: string,
  data: CalendarWizardStoredData
) {
  const scheduleIds = collectStoredDraftScheduleIds(data);
  if (scheduleIds.length === 0) return true;

  const { data: schedules, error } = await supabase
    .from("schedules")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", scheduleIds)
    .returns<Array<{ id: string }>>();

  if (error) return false;
  return (
    findForeignScheduleIds(
      scheduleIds,
      (schedules || []).map((schedule) => schedule.id)
    ).length === 0
  );
}

export async function loadCalendarWizardDraft(
  school: string,
  draftType: CalendarWizardDraftType = GUIDED_CALENDAR_WIZARD_DRAFT_TYPE
): Promise<CalendarWizardDraftActionResult> {
  try {
    const targetDraftType = normalizeDraftType(draftType);
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    const { data, error } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .eq("school_id", schoolData.id)
      .eq("draft_type", targetDraftType)
      .maybeSingle();

    if (error) {
      console.error("Load calendar wizard draft error:", JSON.stringify(error, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not load the saved calendar draft.",
      };
    }

    const draft = data ? safeDraftRecord(data) : null;
    if (draft || targetDraftType === LEGACY_CALENDAR_WIZARD_DRAFT_TYPE) {
      return { status: "success", draft };
    }

    const { data: legacyData, error: legacyError } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .eq("school_id", schoolData.id)
      .eq("draft_type", LEGACY_CALENDAR_WIZARD_DRAFT_TYPE)
      .maybeSingle();

    if (legacyError) {
      console.error("Load legacy calendar wizard draft error:", JSON.stringify(legacyError, null, 2));
      return { status: "success", draft: null };
    }

    const legacyDraft = legacyData ? safeDraftRecord(legacyData) : null;
    if (!legacyDraft) return { status: "success", draft: null };

    if (getCalendarWizardFlowForDraft(legacyDraft.wizard_data) !== expectedFlowForDraftType(targetDraftType)) {
      return { status: "success", draft: null };
    }

    const { data: migratedData, error: migratedError } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .update({
        draft_type: targetDraftType,
        updated_at: new Date().toISOString(),
        updated_by: adminUser.profile.id,
      })
      .eq("id", legacyDraft.id)
      .eq("school_id", schoolData.id)
      .eq("draft_type", LEGACY_CALENDAR_WIZARD_DRAFT_TYPE)
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .single();

    if (migratedError) {
      console.error("Migrate legacy calendar wizard draft error:", JSON.stringify(migratedError, null, 2));
      return { status: "success", draft: legacyDraft };
    }

    return {
      status: "success",
      draft: migratedData ? safeDraftRecord(migratedData) : legacyDraft,
    };
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("Load calendar wizard draft unexpected error:", error);
    return {
      status: "server_error",
      message: "Sundial could not load the saved calendar draft.",
    };
  }
}

export async function saveCalendarWizardDraft(
  school: string,
  input: {
    wizardData: unknown;
    lastKnownUpdatedAt?: string | null;
    draftType?: CalendarWizardDraftType;
  }
): Promise<CalendarWizardDraftActionResult> {
  try {
    const targetDraftType = normalizeDraftType(input.draftType);
    const serialized = serializeCalendarWizardDraft(input.wizardData);
    if (!serialized) {
      return {
        status: "validation_error",
        message: "This calendar draft could not be saved because it is malformed.",
      };
    }

    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    if (
      !(await storedDraftSchedulesBelongToSchool(
        adminUser.supabase,
        schoolData.id,
        serialized.data
      ))
    ) {
      return {
        status: "permission_error",
        message: "This calendar draft references a schedule outside this school.",
      };
    }

    const { data: existing, error: existingError } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .eq("school_id", schoolData.id)
      .eq("draft_type", targetDraftType)
      .maybeSingle();

    if (existingError) {
      console.error("Read calendar wizard draft before save error:", JSON.stringify(existingError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not save the calendar draft.",
      };
    }

    if (
      existing &&
      input.lastKnownUpdatedAt &&
      existing.updated_at !== input.lastKnownUpdatedAt
    ) {
      return {
        status: "draft_conflict",
        message:
          "This calendar draft was updated by another administrator. Reload the latest version before continuing.",
        draft: safeDraftRecord(existing),
      };
    }

    const row = {
      school_id: schoolData.id,
      draft_type: targetDraftType,
      school_year_label: serialized.summary.schoolYearLabel,
      wizard_data: serialized.data,
      updated_by: adminUser.profile.id,
      updated_at: new Date().toISOString(),
      ...(existing ? {} : { created_by: adminUser.profile.id }),
    };

    const draftSelect =
      "id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at";
    const writeResult = existing
      ? await adminUser.supabase
          .from("calendar_wizard_drafts")
          .update(row)
          .eq("id", existing.id)
          .eq("school_id", schoolData.id)
          .eq("draft_type", targetDraftType)
          .eq("updated_at", existing.updated_at)
          .select(draftSelect)
          .maybeSingle()
      : await adminUser.supabase
          .from("calendar_wizard_drafts")
          .insert(row)
          .select(draftSelect)
          .single();
    const { data, error } = writeResult;

    if (error) {
      console.error("Save calendar wizard draft error:", JSON.stringify(error, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not save the calendar draft.",
      };
    }
    if (!data) {
      const { data: newest } = await adminUser.supabase
        .from("calendar_wizard_drafts")
        .select(draftSelect)
        .eq("school_id", schoolData.id)
        .eq("draft_type", targetDraftType)
        .maybeSingle();
      return {
        status: "draft_conflict",
        message:
          "This calendar draft changed while it was being saved. The newer version was preserved.",
        draft: newest ? safeDraftRecord(newest) : null,
      };
    }

    const { data: legacyData } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .eq("school_id", schoolData.id)
      .eq("draft_type", LEGACY_CALENDAR_WIZARD_DRAFT_TYPE)
      .maybeSingle();
    const legacyDraft = legacyData ? safeDraftRecord(legacyData) : null;
    if (
      legacyDraft &&
      getCalendarWizardFlowForDraft(legacyDraft.wizard_data) ===
        expectedFlowForDraftType(targetDraftType)
    ) {
      await adminUser.supabase
        .from("calendar_wizard_drafts")
        .delete()
        .eq("id", legacyDraft.id)
        .eq("school_id", schoolData.id);
    }

    revalidatePath(`/${school}/admin/calendar`);

    return {
      status: "success",
      draft: safeDraftRecord(data),
    };
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("Save calendar wizard draft unexpected error:", error);
    return {
      status: "server_error",
      message: "Sundial could not save the calendar draft.",
    };
  }
}

export async function saveAiCalendarIssueResolutionAction(
  school: string,
  input: {
    resolution: AiImportWarningResolution;
    lastKnownUpdatedAt?: string | null;
  }
): Promise<CalendarWizardDraftActionResult> {
  const resolution = input.resolution;
  if (
    !resolution.issueId ||
    !resolution.issueCode ||
    resolution.issueId.length > 1_000 ||
    resolution.issueCode.length > 200
  ) {
    return {
      status: "validation_error",
      message: "This review item could not be saved because its issue ID is invalid.",
    };
  }

  try {
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    const select =
      "id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at";
    const readLatest = async () => {
      const { data, error } = await adminUser.supabase
        .from("calendar_wizard_drafts")
        .select(select)
        .eq("school_id", schoolData.id)
        .eq("draft_type", AI_CALENDAR_WIZARD_DRAFT_TYPE)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const draft = safeDraftRecord(data);
      if (!draft?.wizard_data.draft.aiImport?.result) return null;
      return {
        snapshot: draft,
        updatedAt: draft.updated_at,
        wizardData: draft.wizard_data,
      };
    };

    const result = await mergeAiCalendarIssueResolutionWithRetry({
      expectedUpdatedAt: input.lastKnownUpdatedAt,
      resolution,
      readLatest,
      writeIfUnchanged: async (latest, expectedUpdatedAt, wizardData) => {
        const expectedTime = Date.parse(expectedUpdatedAt);
        const now = Date.now();
        const updatedAt = new Date(
          Number.isFinite(expectedTime) && now <= expectedTime ? expectedTime + 1 : now
        ).toISOString();
        const { data, error } = await adminUser.supabase
          .from("calendar_wizard_drafts")
          .update({
            wizard_data: wizardData,
            school_year_label: wizardData.draft.schoolYear.label || null,
            updated_by: adminUser.profile.id,
            updated_at: updatedAt,
          })
          .eq("id", latest.id)
          .eq("school_id", schoolData.id)
          .eq("draft_type", AI_CALENDAR_WIZARD_DRAFT_TYPE)
          .eq("updated_at", expectedUpdatedAt)
          .select(select)
          .maybeSingle();
        if (error) throw error;
        return data ? safeDraftRecord(data) : null;
      },
    });

    if (result.status === "success" && result.snapshot) {
      revalidatePath(`/${school}/admin/calendar`);
      logAiCalendarDebug("issue_resolution_saved", {
        school: schoolData.id,
        issueId: resolution.issueId,
        retriedAfterConflict: result.retried,
        updatedAt: result.snapshot.updated_at,
      });
      return {
        status: "success",
        draft: result.snapshot,
        mergeRetried: result.retried,
      };
    }

    if (result.status === "not_found" || result.status === "invalid") {
      return {
        status: "validation_error",
        message: "The current AI calendar review is no longer available. Reload and try again.",
      };
    }

    return {
      status: "draft_conflict",
      message:
        "This review item could not be saved after merging the newest draft. Reload and try again.",
      draft: result.snapshot,
    };
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("Save AI calendar issue resolution error:", error);
    return {
      status: "server_error",
      message: "Sundial could not save this review item. Try again.",
    };
  }
}

export async function deleteCalendarWizardDraft(
  school: string,
  draftType: CalendarWizardDraftType = GUIDED_CALENDAR_WIZARD_DRAFT_TYPE
): Promise<CalendarWizardDraftActionResult> {
  try {
    const targetDraftType = normalizeDraftType(draftType);
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    const { error } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .delete()
      .eq("school_id", schoolData.id)
      .eq("draft_type", targetDraftType);

    if (error) {
      console.error("Delete calendar wizard draft error:", JSON.stringify(error, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not delete the saved calendar draft.",
      };
    }

    revalidatePath(`/${school}/admin/calendar`);

    return { status: "success", draft: null };
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("Delete calendar wizard draft unexpected error:", error);
    return {
      status: "server_error",
      message: "Sundial could not delete the saved calendar draft.",
    };
  }
}

export async function connectDetectedScheduleInDraft(
  school: string,
  input: {
    tempId: string;
    scheduleId: string;
  }
): Promise<CalendarWizardDraftActionResult> {
  const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
  const { data: ownedSchedule, error: ownedScheduleError } = await adminUser.supabase
    .from("schedules")
    .select("id")
    .eq("id", input.scheduleId)
    .eq("school_id", schoolData.id)
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (ownedScheduleError || !ownedSchedule) {
    return {
      status: "permission_error",
      message: "That schedule is not available in this school.",
    };
  }

  const loaded = await loadCalendarWizardDraft(school, AI_CALENDAR_WIZARD_DRAFT_TYPE);
  if (loaded.status !== "success" || !loaded.draft) return loaded;

  const data: CalendarWizardStoredData = {
    ...loaded.draft.wizard_data,
    draft: {
      ...loaded.draft.wizard_data.draft,
      aiImport: loaded.draft.wizard_data.draft.aiImport
        ? {
            ...loaded.draft.wizard_data.draft.aiImport,
            resolutions: loaded.draft.wizard_data.draft.aiImport.resolutions.map((resolution) =>
              resolution.tempId === input.tempId
                ? {
                    ...resolution,
                    matchedExistingScheduleId: input.scheduleId,
                    status: "matched_by_admin",
                    needsSetup: false,
                    setupChoice: "add_now",
                  }
                : resolution
            ),
            unresolvedRequiredScheduleIds:
              loaded.draft.wizard_data.draft.aiImport.unresolvedRequiredScheduleIds?.filter(
                (tempId) => tempId !== input.tempId
              ) || [],
          }
        : null,
    },
  };

  return saveCalendarWizardDraft(school, {
    wizardData: data,
    lastKnownUpdatedAt: loaded.draft.updated_at,
    draftType: AI_CALENDAR_WIZARD_DRAFT_TYPE,
  });
}

function isNextControlFlowError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  );
}

type ScheduleRow = {
  id: string;
};

type ExistingScheduleRow = {
  id: string;
  schedule_name: string;
  calendar_color: string | null;
  active: boolean | null;
  setup_status: string | null;
};

type ExistingCalendarRow = {
  date: string;
};

type SavedCalendarAssignmentRow = {
  date: string;
  schedule_id: string | null;
  is_school_day: boolean;
};

type AiCalendarRpcResult = {
  status:
    | "success"
    | "replacement_required"
    | "validation_error"
    | "permission_error"
    | "schedule_conflict"
    | "draft_conflict"
    | "server_error";
  message?: string;
  existingCount?: number;
  firstExistingDate?: string | null;
  lastExistingDate?: string | null;
  createdScheduleCount?: number;
  insertedRowCount?: number;
};

function validationError(
  message: string,
  fieldErrors?: Record<string, string>
): GenerateCalendarActionResult {
  return {
    status: "validation_error",
    message,
    fieldErrors,
  };
}

function warningIssueList(warnings: Array<{ message: string }>) {
  return Object.fromEntries(
    warnings.map((warning, index) => [`warning.${index + 1}`, warning.message])
  );
}

function isWeekday(value: unknown): value is Weekday {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

function validateDateRange(
  startDate: unknown,
  endDate: unknown,
  fieldPrefix: string,
  fieldErrors: Record<string, string>
) {
  if (typeof startDate !== "string" || !isDateString(startDate)) {
    fieldErrors[`${fieldPrefix}.startDate`] = "Choose a valid start date.";
  }

  if (endDate !== undefined && (typeof endDate !== "string" || !isDateString(endDate))) {
    fieldErrors[`${fieldPrefix}.endDate`] = "Choose a valid end date.";
  }

  if (
    typeof startDate === "string" &&
    isDateString(startDate) &&
    typeof endDate === "string" &&
    isDateString(endDate) &&
    compareDateStrings(startDate, endDate) > 0
  ) {
    fieldErrors[`${fieldPrefix}.endDate`] = "End date cannot be before start date.";
  }
}

function collectScheduleIds(config: CalendarWizardConfig) {
  const ids = new Set<string>();

  if (config.pattern.type === "same") {
    if (config.pattern.scheduleId) ids.add(config.pattern.scheduleId);
  }

  if (config.pattern.type === "repeating") {
    for (const scheduleId of config.pattern.scheduleIds) {
      if (scheduleId) ids.add(scheduleId);
    }
  }

  if (config.pattern.type === "weekday") {
    for (const scheduleId of Object.values(config.pattern.schedulesByWeekday)) {
      if (scheduleId) ids.add(scheduleId);
    }
  }

  for (const specialDay of config.specialDays || []) {
    if (specialDay.scheduleId) ids.add(specialDay.scheduleId);
  }

  return ids;
}

function validateConfigShape(
  config: CalendarWizardConfig,
  options: { allowInstructionalSpecialDayWithoutScheduleOverride?: boolean } = {}
) {
  const fieldErrors: Record<string, string> = {};

  if (!config?.schoolYear) {
    return validationError("School year details are missing.");
  }

  validateDateRange(
    config.schoolYear.startDate,
    config.schoolYear.endDate,
    "schoolYear",
    fieldErrors
  );

  if (
    isDateString(config.schoolYear.startDate) &&
    isDateString(config.schoolYear.endDate) &&
    compareDateStrings(config.schoolYear.startDate, config.schoolYear.endDate) > 0
  ) {
    fieldErrors["schoolYear.endDate"] =
      "Last instructional date must come after the first date.";
  }

  if (
    !Array.isArray(config.operatingWeekdays) ||
    config.operatingWeekdays.length === 0 ||
    config.operatingWeekdays.some((weekday) => !isWeekday(weekday))
  ) {
    fieldErrors.operatingWeekdays =
      "Choose at least one valid weekday when school operates.";
  }

  if (!config.pattern || !["same", "repeating", "weekday"].includes(config.pattern.type)) {
    fieldErrors.pattern = "Choose a normal schedule pattern.";
  } else if (config.pattern.type === "same" && !config.pattern.scheduleId) {
    fieldErrors.pattern = "Choose the schedule used every day.";
  } else if (
    config.pattern.type === "repeating" &&
    (!Array.isArray(config.pattern.scheduleIds) ||
      config.pattern.scheduleIds.filter(Boolean).length < 2)
  ) {
    fieldErrors.pattern = "Choose at least two schedules for the repeating pattern.";
  } else if (config.pattern.type === "weekday") {
    for (const weekday of config.operatingWeekdays || []) {
      if (isWeekday(weekday) && !config.pattern.schedulesByWeekday[weekday]) {
        fieldErrors[`weekday.${weekday}`] =
          "Choose a schedule for every selected operating weekday.";
      }
    }
  }

  (config.noSchoolRanges || []).forEach((range, index) => {
    validateDateRange(range.startDate, range.endDate, `noSchoolRanges.${index}`, fieldErrors);
    if (!range.label?.trim()) {
      fieldErrors[`noSchoolRanges.${index}.label`] = "Add a label.";
    }
  });

  (config.specialDays || []).forEach((specialDay, index) => {
    validateDateRange(specialDay.startDate, specialDay.endDate, `specialDays.${index}`, fieldErrors);
    if (!specialDay.label?.trim()) {
      fieldErrors[`specialDays.${index}.label`] = "Add a display label.";
    }
    if (
      (specialDay.isInstructional ?? true) &&
      !specialDay.scheduleId &&
      !options.allowInstructionalSpecialDayWithoutScheduleOverride
    ) {
      fieldErrors[`specialDays.${index}.scheduleId`] =
        "Choose the schedule used on this special day.";
    }
  });

  (config.informationalDates || []).forEach((info, index) => {
    if (!isDateString(info.date)) {
      fieldErrors[`informationalDates.${index}.date`] = "Choose a valid date.";
    }
    if (!info.label?.trim()) {
      fieldErrors[`informationalDates.${index}.label`] = "Add a label.";
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return validationError("Fix the highlighted schedule wizard details.", fieldErrors);
  }

  return null;
}

function revalidateCalendarConsumers(school: string) {
  revalidatePath(`/${school}/admin`);
  revalidatePath(`/${school}/admin/calendar`);
  revalidatePath(`/${school}/admin/schedules`);
  revalidatePath(`/${school}/app`);
  revalidatePath(`/${school}/app/schedule`);
  revalidatePath(`/${school}/app/bell`);
  revalidatePath(`/${school}/schedule`);
  revalidatePath(`/${school}/kiosk`);
  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/app", "layout");
  revalidatePath("/[school]/kiosk", "page");
}

async function getSetupCalendarCompletionRedirect({
  supabase,
  schoolId,
  school,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  schoolId: string;
  school: string;
}): Promise<
  | {
      status: "success";
      redirectTo: string;
      schedulesNeedingTimes: Array<{ id: string; name: string }>;
    }
  | { status: "validation_error"; result: GenerateCalendarActionResult }
> {
  const result = await completeSetupCalendarStep({ supabase, schoolId, school });
  if (result.status !== "success") {
    return {
      status: "validation_error",
      result: validationError(result.message, {
        calendar: result.message,
      }),
    };
  }

  return {
    status: "success" as const,
    redirectTo: await getSchoolSetupStepPath(school, "complete"),
    schedulesNeedingTimes: result.schedulesNeedingTimes,
  };
}

export async function getAiCalendarDebugSnapshotAction(
  school: string
): Promise<AiCalendarDebugSnapshotActionResult> {
  if (!aiCalendarDebugEnabled()) {
    return { status: "disabled", message: "AI Calendar Debug Mode is disabled." };
  }

  const routeRequestId = crypto.randomUUID();
  const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
  const { data: draftRow, error } = await adminUser.supabase
    .from("calendar_wizard_drafts")
    .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
    .eq("school_id", schoolData.id)
    .eq("draft_type", AI_CALENDAR_WIZARD_DRAFT_TYPE)
    .maybeSingle();

  if (error || !draftRow) {
    return { status: "not_found", message: "No saved AI calendar draft is available." };
  }

  const draft = safeDraftRecord(draftRow);
  const metadata = draft?.wizard_data.draft.aiImport;
  if (!draft || !metadata?.result) {
    return { status: "not_found", message: "No saved AI calendar review is available." };
  }
  const validation = validateAiCalendarImportResult(metadata.result);
  if (!validation.success) {
    return { status: "validation_error", message: "The saved AI calendar review is malformed." };
  }

  const staleIssueDefinitions =
    metadata.analysisVersion !== AI_CALENDAR_ANALYSIS_VERSION ||
    metadata.issueSchemaVersion !== AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION;
  const importResult = staleIssueDefinitions
    ? normalizePersistedAiCalendarImportResult(validation.data)
    : validation.data;
  const generated = generateSchoolYearCalendar(buildAiPreviewConfig(importResult));
  const classification = normalizeAndDeduplicateReviewIssues({
    importResult,
    generationWarnings: generated.warnings,
    warningResolutions: metadata.warningResolutions || [],
    analysisVersion: staleIssueDefinitions
      ? AI_CALENDAR_ANALYSIS_VERSION
      : metadata.analysisVersion,
  });
  const snapshot = buildAiCalendarDebugSnapshot({
    schoolSlug: school,
    routeRequestId,
    importResult,
    generationWarnings: generated.warnings,
    previewDays: generated.days,
    classification,
    metadata: {
      ...metadata,
      analysisVersion: staleIssueDefinitions
        ? AI_CALENDAR_ANALYSIS_VERSION
        : metadata.analysisVersion,
    },
    warningResolutions: metadata.warningResolutions || [],
    restore: {
      restoredFromCache: metadata.cacheHit === true,
      restoredFromWizardDraft: true,
      cachedResultVersion: metadata.analysisVersion,
      draftVersion: draft.wizard_data.version,
      currentAnalysisAttemptId: metadata.analysisAttemptId,
      draftAnalysisAttemptId: metadata.analysisAttemptId,
      staleDraftDetected: staleIssueDefinitions,
    },
  });
  snapshot.issues = snapshot.issues.map((issue) => ({
    ...issue,
    lastModifiedAtStage: "server creation validation",
    history: [
      ...issue.history,
      {
        stage: "serverCreationValidation",
        severity: issue.severity,
        status: issue.status,
      },
    ],
  }));

  const logContext = {
    routeRequestId,
    analysisAttemptId: metadata.analysisAttemptId,
    school: schoolData.id,
  };
  logAiCalendarDebug("review_issues_raw", {
    ...logContext,
    count: classification.diagnosticCounts.rawWarningCount,
    warningCodes: [...importResult.warnings, ...generated.warnings].map((warning) => warning.code),
  });
  logAiCalendarDebug("review_issues_normalized", {
    ...logContext,
    count: classification.diagnosticCounts.normalizedIssueCount,
  });
  logAiCalendarDebug("review_issues_deduplicated", {
    ...logContext,
    count: classification.diagnosticCounts.deduplicatedIssueCount,
    issues: snapshot.issues.map((issue) => ({
      issueId: issue.issueId,
      affectedDates: issue.affectedDates,
      severity: issue.severity,
      status: issue.status,
    })),
  });
  logAiCalendarDebug("readiness_calculated", {
    ...logContext,
    blockerIds: snapshot.blockerIds,
    counts: snapshot.counts,
  });
  if (snapshot.blockerIds.length > 0) {
    logAiCalendarDebug("create_calendar_disabled", {
      ...logContext,
      blockerIds: snapshot.blockerIds,
      reasons: snapshot.issues
        .filter((issue) => issue.unresolvedBlocker)
        .map((issue) => issue.blockingReason),
    });
  }

  return { status: "success", snapshot };
}

export async function recordAiCalendarDebugResolutionEventAction(
  school: string,
  value: AiCalendarDebugResolutionEvent
) {
  if (!aiCalendarDebugEnabled()) return { status: "disabled" as const };
  const { schoolData } = await getCalendarDraftSchoolContext(school);
  const allowedEvents = new Set([
    "issue_resolution_started",
    "issue_resolution_finished",
    "issue_resolution_failed",
  ]);
  if (
    !value ||
    !allowedEvents.has(value.event) ||
    typeof value.issueId !== "string" ||
    !value.issueId ||
    value.issueId.length > 500 ||
    !Array.isArray(value.affectedDates)
  ) {
    return { status: "validation_error" as const };
  }
  logAiCalendarDebug(value.event, {
    routeRequestId: String(value.routeRequestId).slice(0, 100),
    school: schoolData.id,
    issueId: value.issueId,
    affectedDates: value.affectedDates.slice(0, 50),
    previousSeverity: value.previousSeverity,
    previousStatus: value.previousStatus,
    nextSeverity: value.nextSeverity,
    nextStatus: value.nextStatus,
    draftSaveResult: value.draftSaveResult,
    remainingBlockerIds: Array.isArray(value.remainingBlockerIds)
      ? value.remainingBlockerIds.slice(0, 100)
      : undefined,
    occurredAt: value.occurredAt,
  });
  return { status: "success" as const };
}

export async function createAiCalendarFromDraftAction(
  school: string,
  input: CreateAiCalendarFromDraftActionInput = {}
): Promise<GenerateCalendarActionResult> {
  try {
    const routeRequestId = crypto.randomUUID();
    const { schoolData, adminUser } = await getCalendarDraftSchoolContext(school);
    const { data: draftRow, error: draftError } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .eq("school_id", schoolData.id)
      .eq("draft_type", AI_CALENDAR_WIZARD_DRAFT_TYPE)
      .maybeSingle();

    if (draftError) {
      console.error("AI calendar load draft error:", JSON.stringify(draftError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not load the saved calendar draft.",
      };
    }

    const draft = draftRow ? safeDraftRecord(draftRow) : null;
    if (!draft) {
      return {
        status: "draft_conflict",
        message: "The saved AI calendar draft could not be found. Reload the wizard and try again.",
      };
    }

    if (input.expectedDraftUpdatedAt && draft.updated_at !== input.expectedDraftUpdatedAt) {
      return {
        status: "draft_conflict",
        message:
          "This calendar draft changed while you were reviewing it. Reload the latest draft before creating the calendar.",
      };
    }

    const aiImport = draft.wizard_data.draft.aiImport;
    const persistedImportResult = aiImport?.result;
    if (!persistedImportResult) {
      return validationError(
        "This draft does not include an AI calendar import. Continue manually or upload the PDF again."
      );
    }
    const importValidation = validateAiCalendarImportResult(persistedImportResult);
    if (!importValidation.success) {
      return validationError(
        "The saved AI calendar review is malformed. Reload the analysis before creating the calendar."
      );
    }
    const staleIssueDefinitions =
      aiImport.analysisVersion !== AI_CALENDAR_ANALYSIS_VERSION ||
      aiImport.issueSchemaVersion !== AI_CALENDAR_REVIEW_ISSUE_SCHEMA_VERSION;
    const importResult = staleIssueDefinitions
      ? normalizePersistedAiCalendarImportResult(importValidation.data)
      : importValidation.data;
    const detectedNameByTempId = new Map(
      importResult.detectedSchedules.map((schedule) => [schedule.tempId, schedule.detectedName])
    );
    const draftAssignmentDigest = await computeDatedScheduleAssignmentDigest(
      (importResult.datedScheduleAssignments || []).map((assignment) => ({
        date: assignment.date,
        scheduleName:
          assignment.scheduleName ||
          detectedNameByTempId.get(assignment.scheduleTempId) ||
          assignment.scheduleTempId,
        source: assignment.source,
      }))
    );
    console.info("AI calendar draft assignment digest", {
      analysisAttemptId: aiImport.analysisAttemptId,
      draftAssignmentDigest,
      assignmentCount: importResult.datedScheduleAssignments?.length || 0,
    });
    const unreviewedRequiredDates = getUnreviewedRequiredAssignmentDates(importResult);
    if (unreviewedRequiredDates.length > 0) {
      return validationError(
        "Verify the first 10 inferred rotation assignments before creating the calendar.",
        { calendar: `${unreviewedRequiredDates.length} inferred assignments still need explicit review.` }
      );
    }

    const referencedRemovedScheduleIds = collectReferencedRemovedScheduleIds(
      importResult,
      aiImport.removedSchedules || []
    );
    if (referencedRemovedScheduleIds.length > 0) {
      return validationError(
        "Fix these calendar issues before creating the calendar:",
        {
          schedules:
            "A removed detected schedule is still referenced by the imported calendar.",
        }
      );
    }

    const { data: existingSchedules, error: scheduleError } = await adminUser.supabase
      .from("schedules")
      .select("id, schedule_name, calendar_color, active, setup_status")
      .eq("school_id", schoolData.id)
      .returns<ExistingScheduleRow[]>();

    if (scheduleError) {
      console.error("AI calendar schedules lookup error:", JSON.stringify(scheduleError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not verify schedules for this school.",
      };
    }

    const plan = planAiSchedulePersistence({
      importResult,
      resolutions: aiImport.resolutions || [],
      existingSchedules: (existingSchedules || []).map(
        (schedule): ExistingScheduleForAiPersistence => ({
          id: schedule.id,
          name: schedule.schedule_name,
          active: schedule.active,
          setupStatus: schedule.setup_status,
          calendarColor: schedule.calendar_color,
        })
      ),
    });

    if (plan.conflict) {
      return {
        status: "schedule_conflict",
        message: plan.conflict,
      };
    }

    const config = resolveAiScheduleReferences(importResult, plan.tempToScheduleId);
    const shapeError = validateConfigShape(config, {
      allowInstructionalSpecialDayWithoutScheduleOverride: true,
    });
    if (shapeError) return shapeError;

    const remainingTempIds = collectUnmappedTemporaryScheduleIds(config);
    if (remainingTempIds.length > 0) {
      return validationError(
        "Some detected schedules could not be created or matched.",
        { schedules: "Detected schedules need review." }
      );
    }

    const generated = generateSchoolYearCalendar(config);
    const countReviewState = getInstructionalDayCountReviewState(
      importResult.instructionalDayCountReview,
      generated.summary.instructionalDayCount
    );
    if (!countReviewState.ready) {
      return validationError(
        "Review the instructional-day count difference before creating the calendar.",
        {
          calendar: countReviewState.unresolvedDates.length > 0
            ? `${countReviewState.unresolvedDates.length} discrepancy dates still need classifications.`
            : "Confirm the final instructional count with the required acknowledgment.",
        }
      );
    }

    const persistedScheduleNames = new Map<string, string>();
    const existingScheduleNames = new Map<string, string>();
    for (const schedule of existingSchedules || []) {
      persistedScheduleNames.set(schedule.id, schedule.schedule_name);
      existingScheduleNames.set(schedule.id, schedule.schedule_name);
    }
    for (const detected of importResult.detectedSchedules) {
      const persistedId = plan.tempToScheduleId[detected.tempId];
      if (persistedId) persistedScheduleNames.set(persistedId, detected.detectedName);
    }
    const creationPayloadDigest = await computeAssignmentDigest(
      generated.days,
      (scheduleId) => persistedScheduleNames.get(scheduleId)
    );
    const creationClassificationDigest = await computeCalendarClassificationDigest(
      generated.days,
      (scheduleId) => persistedScheduleNames.get(scheduleId)
    );
    const previewScheduleNames = new Map(
      importResult.detectedSchedules.map((schedule) => [schedule.tempId, schedule.detectedName])
    );
    for (const resolution of aiImport.resolutions || []) {
      previewScheduleNames.set(
        resolution.tempId,
        resolution.matchedExistingScheduleId
          ? existingScheduleNames.get(resolution.matchedExistingScheduleId) || resolution.detectedName
          : resolution.reviewedName?.trim() || resolution.detectedName
      );
    }
    const serverPreview = generateSchoolYearCalendar(buildAiPreviewConfig(importResult));
    const serverPreviewAssignmentDigest = await computeAssignmentDigest(
      serverPreview.days,
      (scheduleId) => previewScheduleNames.get(scheduleId)
    );
    const serverPreviewClassificationDigest = await computeCalendarClassificationDigest(
      serverPreview.days,
      (scheduleId) => previewScheduleNames.get(scheduleId)
    );
    const clientPreviewAssignmentDigest = input.previewAssignmentDigest;
    const clientPreviewClassificationDigest = input.previewClassificationDigest;
    const matches = serverPreviewAssignmentDigest === creationPayloadDigest &&
      serverPreviewClassificationDigest === creationClassificationDigest &&
      (!clientPreviewAssignmentDigest || clientPreviewAssignmentDigest === serverPreviewAssignmentDigest) &&
      (!clientPreviewClassificationDigest || clientPreviewClassificationDigest === serverPreviewClassificationDigest);
    const previewCreationDifferingDates = serverPreviewAssignmentDigest === creationPayloadDigest
      ? []
      : findAssignmentDigestDifferences(
          serverPreview.days,
          generated.days,
          (scheduleId) => previewScheduleNames.get(scheduleId),
          (scheduleId) => persistedScheduleNames.get(scheduleId)
        );
    console.info("AI calendar assignment digest diagnostic", {
      analysisAttemptId: aiImport.analysisAttemptId,
      previewAssignmentDigest: serverPreviewAssignmentDigest,
      clientPreviewAssignmentDigest,
      creationPayloadDigest,
      serverPreviewClassificationDigest,
      clientPreviewClassificationDigest,
      creationClassificationDigest,
      matches,
      firstDifferingDates: previewCreationDifferingDates,
    });
    if (!matches) {
      return {
        status: "server_error",
        code: "calendar_assignment_digest_mismatch",
        severity: "high",
        message: `calendar_assignment_digest_mismatch: Preview and creation assignments differ${previewCreationDifferingDates.length > 0 ? ` on ${previewCreationDifferingDates.join(", ")}` : ""}. Review the latest preview and try again.`,
      };
    }

    const vectorByDate = new Map(
      (importResult.deterministicAssignments || []).map((assignment) => [assignment.date, assignment])
    );
    for (const day of generated.days.filter((item) => item.isSchoolDay).slice(0, 10)) {
      const vector = vectorByDate.get(day.date);
      const finalScheduleCanonicalKey = day.scheduleId
        ? canonicalScheduleName(persistedScheduleNames.get(day.scheduleId) || day.scheduleId)
        : null;
      const vectorKey = vector ? canonicalScheduleName(vector.scheduleName) : null;
      const wasOverwritten = Boolean(vectorKey && finalScheduleCanonicalKey !== vectorKey);
      console.info("AI calendar assignment provenance", {
        date: day.date,
        finalScheduleCanonicalKey,
        assignmentSource: day.assignmentSource,
        analysisAttemptId: aiImport.analysisAttemptId,
        existingCalendarRead: false,
        patternSource: importResult.deterministicExtraction?.status === "succeeded"
          ? "pdf_vector_fill"
          : importResult.assignmentReview
            ? "ai_inference_reviewed"
            : "ai_inference",
        vectorAssignmentPresent: Boolean(vector),
        wasOverwritten,
        overwriteSource: wasOverwritten ? day.assignmentSource : null,
      });
    }

    if (generated.summary.unassignedInstructionalDayCount > 0) {
      return validationError(
        "Some instructional days are missing a schedule.",
        { calendar: "Every instructional day needs a schedule assignment." }
      );
    }

    if (generated.summary.instructionalDayCount === 0) {
      return validationError(
        "No instructional days were generated from this import.",
        { calendar: "Review the school-year dates and operating weekdays." }
      );
    }

    const finalWarningClassification = normalizeAndDeduplicateReviewIssues({
      importResult,
      generationWarnings: generated.warnings,
      warningResolutions: aiImport.warningResolutions || [],
      analysisVersion: staleIssueDefinitions
        ? AI_CALENDAR_ANALYSIS_VERSION
        : aiImport.analysisVersion,
    });
    const unresolvedBlockingIssues = getUnresolvedBlockingReviewIssues(
      finalWarningClassification.issues
    );
    logCalendarWarningClassification("final_normalized_issues", finalWarningClassification);
    const debugContext = {
      routeRequestId,
      analysisAttemptId: aiImport.analysisAttemptId,
      school: schoolData.id,
    };
    logAiCalendarDebug("review_issues_raw", {
      ...debugContext,
      count: finalWarningClassification.diagnosticCounts.rawWarningCount,
      warningCodes: [...importResult.warnings, ...generated.warnings].map(
        (warning) => warning.code
      ),
    });
    logAiCalendarDebug("review_issues_normalized", {
      ...debugContext,
      count: finalWarningClassification.diagnosticCounts.normalizedIssueCount,
    });
    logAiCalendarDebug("review_issues_deduplicated", {
      ...debugContext,
      count: finalWarningClassification.diagnosticCounts.deduplicatedIssueCount,
      issueIds: finalWarningClassification.issues.map((issue) => issue.issueId),
    });
    logAiCalendarDebug("readiness_calculated", {
      ...debugContext,
      blockerIds: unresolvedBlockingIssues.map(
        (issue) => issue.issueId
      ),
      counts: finalWarningClassification.diagnosticCounts,
    });

    if (unresolvedBlockingIssues.length > 0) {
      logAiCalendarDebug("create_calendar_disabled", {
        ...debugContext,
        blockers: unresolvedBlockingIssues.map((issue) => ({
          issueId: issue.issueId,
          affectedDates: issue.affectedDates,
          severity: issue.severity,
          status: issue.status,
          reason: `${issue.issueCode} is unresolved and blocking after final normalization.`,
        })),
      });
      return validationError(
        "Fix these calendar issues before creating the calendar:",
        warningIssueList(unresolvedBlockingIssues)
      );
    }

    const explicitlyAcknowledgedIssueCodes = new Set(
      (input.acknowledgedIssueCodes || []).filter(
        (code): code is string => typeof code === "string" && code.length > 0
      )
    );
    const persistedResolvedIssueIds = new Set([
      ...finalWarningClassification.acknowledgedReviewWarnings,
    ].map((warning) => warning.issueId));
    const acknowledgedIssueCodes = new Set(explicitlyAcknowledgedIssueCodes);
    for (const warning of [
      ...finalWarningClassification.acknowledgedReviewWarnings,
    ]) {
      acknowledgedIssueCodes.add(warning.issueCode);
    }
    if (importResult.instructionalDayCountReview && countReviewState.ready) {
      acknowledgedIssueCodes.add("instructional_day_count_mismatch");
    }
    const missingAcknowledgments = [
      ...finalWarningClassification.unacknowledgedReviewWarnings,
    ].filter(
      (warning) =>
        !persistedResolvedIssueIds.has(warning.issueId) &&
        !explicitlyAcknowledgedIssueCodes.has(warning.issueCode)
    );
    if (missingAcknowledgments.length > 0) {
      return validationError(
        "Acknowledge the remaining review notes before creating the calendar.",
        warningIssueList(missingAcknowledgments)
      );
    }

    const rows = mapGeneratedCalendarDaysToRows(generated.days, schoolData.id);
    const labelTooLong = rows.find((row) => (row.label?.length || 0) > 1000);
    if (labelTooLong) {
      return validationError(
        "One of the calendar labels is too long. Shorten labels before creating the calendar.",
        { label: `The label on ${labelTooLong.date} is too long.` }
      );
    }

    const rpcRowValidation = validateAiCalendarRpcRows(rows);
    if (!rpcRowValidation.success) {
      console.error("AI calendar RPC row validation blocked unresolved schedule IDs:", {
        invalidIds: rpcRowValidation.invalidIds,
      });
      return validationError(
        "Some imported schedules could not be connected. Please review the detected schedules and try again.",
        { schedules: "Detected schedule references need review." }
      );
    }

    const { data: rpcData, error: rpcError } = await adminUser.supabase.rpc(
      "create_available_ai_calendar_from_draft",
      {
        p_school_id: schoolData.id,
        p_draft_id: draft.id,
        p_expected_draft_updated_at: draft.updated_at,
        p_start_date: config.schoolYear.startDate,
        p_end_date: config.schoolYear.endDate,
        p_replace_existing: Boolean(input.replaceExisting),
        p_schedules: plan.schedulesToCreate.map((schedule) => ({
          id: schedule.id,
          temp_id: schedule.tempId,
          schedule_name: schedule.scheduleName,
          schedule_type: schedule.scheduleType,
          calendar_color: schedule.calendarColor,
          setup_status: schedule.setupStatus,
        })),
        p_calendar_days: rows.map((row) => ({
          date: row.date,
          schedule_id: row.schedule_id,
          base_schedule_id: row.base_schedule_id,
          label: row.label,
          is_school_day: row.is_school_day,
        })),
        p_review: {
          analysis_attempt_id: aiImport.analysisAttemptId || null,
          analysis_version: staleIssueDefinitions
            ? AI_CALENDAR_ANALYSIS_VERSION
            : aiImport.analysisVersion || AI_CALENDAR_ANALYSIS_VERSION,
          acknowledged_issue_codes: [...acknowledgedIssueCodes],
          classification_digest: creationClassificationDigest,
          final_approved_instructional_day_count:
            generated.summary.instructionalDayCount,
          review_note:
            importResult.instructionalDayCountReview?.reviewNote || null,
        },
        p_count_review: importResult.instructionalDayCountReview
          ? {
              reason_code: importResult.instructionalDayCountReview.reasonCode,
              declared_instructional_day_count:
                importResult.instructionalDayCountReview.declaredInstructionalDayCount,
              generated_instructional_day_count:
                importResult.instructionalDayCountReview.generatedInstructionalDayCount,
              final_approved_instructional_day_count:
                importResult.instructionalDayCountReview.finalApprovedInstructionalDayCount ??
                generated.summary.instructionalDayCount,
              acknowledged: countReviewState.ready,
              review_status: countReviewState.status,
              acknowledged_issue_codes: [...acknowledgedIssueCodes],
              review_note: importResult.instructionalDayCountReview.reviewNote || null,
              classifications: importResult.instructionalDayCountReview.discrepancyDates,
              classification_digest: creationClassificationDigest,
              calendar_coverage_start:
                importResult.schoolYear.calendarCoverageStart || importResult.schoolYear.startDate,
              calendar_coverage_end:
                importResult.schoolYear.calendarCoverageEnd || importResult.schoolYear.endDate,
              instructional_start:
                importResult.schoolYear.instructionalStart || importResult.schoolYear.startDate,
              instructional_end:
                importResult.schoolYear.instructionalEnd || importResult.schoolYear.endDate,
            }
          : null,
      }
    );

    if (rpcError) {
      console.error("AI calendar RPC error:", JSON.stringify(rpcError, null, 2));
      if (`${rpcError.message} ${rpcError.details || ""}`.includes("calendar_assignment_digest_mismatch")) {
        return {
          status: "server_error",
          code: "calendar_assignment_digest_mismatch",
          severity: "high",
          message: "calendar_assignment_digest_mismatch: The saved calendar assignments differed from the creation payload. No changes were saved.",
        };
      }
      return {
        status: "server_error",
        message: "Sundial could not create the imported calendar. No changes were saved.",
      };
    }

    const rpcResult = rpcData as AiCalendarRpcResult | null;
    if (!rpcResult) {
      return {
        status: "server_error",
        message: "Sundial could not create the imported calendar. No changes were saved.",
      };
    }

    if (rpcResult.status === "replacement_required") {
      return {
        status: "replacement_required",
        existingCount: rpcResult.existingCount || 0,
        firstExistingDate: rpcResult.firstExistingDate || null,
        lastExistingDate: rpcResult.lastExistingDate || null,
        summary: generated.summary,
      };
    }

    if (rpcResult.status !== "success") {
      return {
        status: rpcResult.status,
        message:
          rpcResult.message ||
          "Sundial could not create the imported calendar. Review the import and try again.",
      } as GenerateCalendarActionResult;
    }

    const { data: savedCalendarRows, error: savedCalendarError } = await adminUser.supabase
      .from("calendar_days")
      .select("date, schedule_id, is_school_day")
      .eq("school_id", schoolData.id)
      .gte("date", config.schoolYear.startDate)
      .lte("date", config.schoolYear.endDate)
      .order("date")
      .returns<SavedCalendarAssignmentRow[]>();
    if (savedCalendarError) {
      console.error("AI calendar saved assignment verification error:", JSON.stringify(savedCalendarError, null, 2));
      return {
        status: "server_error",
        severity: "high",
        message: "The calendar was created, but Sundial could not verify the saved assignments. Reload the calendar before retrying.",
      };
    }
    const savedCalendarDigest = await computeAssignmentDigest(
      (savedCalendarRows || []).map((row) => ({
        date: row.date,
        scheduleId: row.schedule_id,
        isSchoolDay: row.is_school_day,
      })),
      (scheduleId) => persistedScheduleNames.get(scheduleId)
    );
    const savedDigestMatches = creationPayloadDigest === savedCalendarDigest;
    const firstDifferingDates = savedDigestMatches
      ? []
      : findAssignmentDigestDifferences(
          generated.days,
          (savedCalendarRows || []).map((row) => ({
            date: row.date,
            scheduleId: row.schedule_id,
            isSchoolDay: row.is_school_day,
          })),
          (scheduleId) => persistedScheduleNames.get(scheduleId),
          (scheduleId) => persistedScheduleNames.get(scheduleId)
        );
    console.info("AI calendar saved assignment digest diagnostic", {
      analysisAttemptId: aiImport.analysisAttemptId,
      creationPayloadDigest,
      savedCalendarDigest,
      matches: savedDigestMatches,
      firstDifferingDates,
    });
    if (!savedDigestMatches) {
      return {
        status: "server_error",
        code: "calendar_assignment_digest_mismatch",
        severity: "high",
        message: `calendar_assignment_digest_mismatch: Saved assignments differed on ${firstDifferingDates.join(", ") || "one or more dates"}.`,
      };
    }

    revalidateCalendarConsumers(school);

    const setupCompletion =
      input.launchContext === "setup"
        ? await getSetupCalendarCompletionRedirect({
            supabase: adminUser.supabase,
            schoolId: schoolData.id,
            school,
          })
        : null;
    if (setupCompletion?.status === "validation_error") {
      return setupCompletion.result;
    }

    return {
      status: "success",
      redirectTo: setupCompletion?.status === "success" ? setupCompletion.redirectTo : undefined,
      summary: {
        schoolYearLabel: config.schoolYear.name || "School Year",
        startDate: config.schoolYear.startDate,
        endDate: config.schoolYear.endDate,
        insertedRowCount: rpcResult.insertedRowCount || rows.length,
        instructionalDayCount: generated.summary.instructionalDayCount,
        noSchoolWeekdayCount: generated.summary.noSchoolWeekdayCount,
        specialInstructionalDayCount: generated.summary.specialInstructionalDayCount,
        warningCount: generated.summary.warningCount,
        warnings: generated.warnings,
        schedulesCreated: plan.schedulesToCreate.map((schedule) => ({
          id: schedule.id,
          name: schedule.scheduleName,
        })),
        matchedScheduleCount: plan.matchedScheduleIds.length,
        schedulesNeedingTimes:
          setupCompletion?.status === "success"
            ? setupCompletion.schedulesNeedingTimes
            : plan.schedulesNeedingTimes,
        warningsRemaining:
          finalWarningClassification.unacknowledgedReviewWarnings.length,
      },
    };
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("AI calendar creation unexpected error:", error);
    return {
      status: "server_error",
      message: "Sundial could not create the imported calendar. No changes were saved.",
    };
  }
}

export async function generateCalendarAction(
  school: string,
  input: GenerateCalendarActionInput
): Promise<GenerateCalendarActionResult> {
  try {
    const schoolData = await getSchoolForSetup(school);

    if (!schoolData) {
      notFound();
    }

    const { supabase: authedSupabase } = await requireAdminSectionAccess(
      schoolData.id,
      "calendar",
      school
    );
    const config = input.config;
    const shapeError = validateConfigShape(config);

    if (shapeError) {
      return shapeError;
    }

    const { data: activeSchedules, error: schedulesError } = await authedSupabase
      .from("schedules")
      .select("id")
      .eq("school_id", schoolData.id)
      .eq("active", true)
      .returns<ScheduleRow[]>();

    if (schedulesError) {
      console.error("Calendar generation schedules error:", JSON.stringify(schedulesError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not verify your active schedules. Please try again.",
      };
    }

    const activeScheduleIds = new Set((activeSchedules || []).map((schedule) => schedule.id));
    const referencedScheduleIds = collectScheduleIds(config);
    const invalidScheduleIds = [...referencedScheduleIds].filter(
      (scheduleId) => !activeScheduleIds.has(scheduleId)
    );

    if (invalidScheduleIds.length > 0) {
      return validationError(
        "One or more selected schedules are no longer active for this school. Refresh and choose schedules again.",
        { schedules: "A selected schedule is unavailable." }
      );
    }

    const generated = generateSchoolYearCalendar(config);

    if (generated.summary.unassignedInstructionalDayCount > 0) {
      return validationError(
        "Every instructional day needs a schedule before the calendar can be generated.",
        { calendar: "Some instructional days are missing schedules." }
      );
    }

    const rows = mapGeneratedCalendarDaysToRows(generated.days, schoolData.id);
    const labelTooLong = rows.find((row) => (row.label?.length || 0) > 1000);

    if (labelTooLong) {
      return validationError(
        "One of the calendar labels is too long. Shorten labels before generating the calendar.",
        { label: `The label on ${labelTooLong.date} is too long.` }
      );
    }

    const { data: existingRows, error: existingError } = await authedSupabase
      .from("calendar_days")
      .select("date")
      .eq("school_id", schoolData.id)
      .gte("date", config.schoolYear.startDate)
      .lte("date", config.schoolYear.endDate)
      .order("date", { ascending: true })
      .returns<ExistingCalendarRow[]>();

    if (existingError) {
      console.error("Calendar generation existing rows error:", JSON.stringify(existingError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not check the existing calendar. Please try again.",
      };
    }

    if ((existingRows?.length || 0) > 0 && !input.replaceExisting) {
      return {
        status: "replacement_required",
        existingCount: existingRows?.length || 0,
        firstExistingDate: existingRows?.[0]?.date || null,
        lastExistingDate: existingRows?.[existingRows.length - 1]?.date || null,
        summary: generated.summary,
      };
    }

    const { error: deleteError } = await authedSupabase
      .from("calendar_days")
      .delete()
      .eq("school_id", schoolData.id)
      .gte("date", config.schoolYear.startDate)
      .lte("date", config.schoolYear.endDate);

    if (deleteError) {
      console.error("Calendar generation delete error:", JSON.stringify(deleteError, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not replace the existing calendar. No new calendar was saved.",
      };
    }

    if (rows.length > 0) {
      const { error: insertError } = await authedSupabase
        .from("calendar_days")
        .insert(rows);

      if (insertError) {
        console.error("Calendar generation insert error:", JSON.stringify(insertError, null, 2));
        return {
          status: "server_error",
          severity: "high",
          message:
            "Sundial deleted the old calendar range but could not insert the replacement rows. Please contact support before generating again.",
        };
      }
    }

    revalidateCalendarConsumers(school);

    const setupCompletion =
      input.launchContext === "setup"
        ? await (async () => {
            await authedSupabase
              .from("calendar_wizard_drafts")
              .delete()
              .eq("school_id", schoolData.id)
              .eq("draft_type", GUIDED_CALENDAR_WIZARD_DRAFT_TYPE);

            return getSetupCalendarCompletionRedirect({
              supabase: authedSupabase,
              schoolId: schoolData.id,
              school,
            });
          })()
        : null;
    if (setupCompletion?.status === "validation_error") {
      return setupCompletion.result;
    }

    return {
      status: "success",
      redirectTo: setupCompletion?.status === "success" ? setupCompletion.redirectTo : undefined,
      summary: {
        schoolYearLabel: config.schoolYear.name || "School Year",
        startDate: config.schoolYear.startDate,
        endDate: config.schoolYear.endDate,
        insertedRowCount: rows.length,
        instructionalDayCount: generated.summary.instructionalDayCount,
        noSchoolWeekdayCount: generated.summary.noSchoolWeekdayCount,
        specialInstructionalDayCount: generated.summary.specialInstructionalDayCount,
        warningCount: generated.summary.warningCount,
        warnings: generated.warnings,
        schedulesNeedingTimes:
          setupCompletion?.status === "success"
            ? setupCompletion.schedulesNeedingTimes
            : undefined,
      },
    };
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }

    console.error("Calendar generation unexpected error:", error);
    return {
      status: "server_error",
      message: "Sundial could not generate the calendar. Please try again.",
    };
  }
}
