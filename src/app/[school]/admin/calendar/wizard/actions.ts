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
  serializeCalendarWizardDraft,
  type CalendarWizardDraftType,
  type CalendarWizardDraftRecord,
  type CalendarWizardStoredData,
} from "@/lib/calendarWizard/draftPersistence";
import { generateSchoolYearCalendar } from "@/lib/calendarWizard/generateSchoolYearCalendar";
import { mapGeneratedCalendarDaysToRows } from "@/lib/calendarWizard/persistence";
import {
  classifyCalendarWarnings,
  collectReferencedRemovedScheduleIds,
  collectUnmappedTemporaryScheduleIds,
  logCalendarWarningClassification,
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
    };

export type CreateAiCalendarFromDraftActionInput = {
  replaceExisting?: boolean;
  expectedDraftUpdatedAt?: string | null;
  launchContext?: CalendarWizardLaunchContext | null;
};

export type CalendarWizardDraftActionResult =
  | {
      status: "success";
      draft: CalendarWizardDraftRecord | null;
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

    const { data, error } = await adminUser.supabase
      .from("calendar_wizard_drafts")
      .upsert(row, { onConflict: "school_id,draft_type" })
      .select("id, school_id, draft_type, school_year_label, wizard_data, created_at, updated_at")
      .single();

    if (error || !data) {
      console.error("Save calendar wizard draft error:", JSON.stringify(error, null, 2));
      return {
        status: "server_error",
        message: "Sundial could not save the calendar draft.",
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

export async function createAiCalendarFromDraftAction(
  school: string,
  input: CreateAiCalendarFromDraftActionInput = {}
): Promise<GenerateCalendarActionResult> {
  try {
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
    const importResult = aiImport?.result;
    if (!importResult) {
      return validationError(
        "This draft does not include an AI calendar import. Continue manually or upload the PDF again."
      );
    }

    const aiWarningClassification = classifyCalendarWarnings(
      importResult.warnings,
      aiImport.warningResolutions || []
    );
    logCalendarWarningClassification("ai_import", aiWarningClassification);

    if (aiWarningClassification.blockingWarnings.length > 0) {
      return validationError(
        "Fix these calendar issues before creating the calendar:",
        warningIssueList(aiWarningClassification.blockingWarnings)
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

    const generatedWarningClassification = classifyCalendarWarnings(generated.warnings);
    logCalendarWarningClassification("generated_calendar", generatedWarningClassification);

    if (generatedWarningClassification.blockingWarnings.length > 0) {
      return validationError(
        "Fix these calendar issues before creating the calendar:",
        warningIssueList(generatedWarningClassification.blockingWarnings)
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
      }
    );

    if (rpcError) {
      console.error("AI calendar RPC error:", JSON.stringify(rpcError, null, 2));
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
          aiWarningClassification.unresolvedReviewWarnings.length +
          generatedWarningClassification.reviewWarnings.length,
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
