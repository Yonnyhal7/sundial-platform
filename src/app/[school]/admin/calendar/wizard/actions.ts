"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { compareDateStrings, isDateString } from "@/lib/calendarWizard/dateUtils";
import { generateSchoolYearCalendar } from "@/lib/calendarWizard/generateSchoolYearCalendar";
import { mapGeneratedCalendarDaysToRows } from "@/lib/calendarWizard/persistence";
import type {
  CalendarGenerationSummary,
  CalendarGenerationWarning,
  CalendarWizardConfig,
  Weekday,
} from "@/lib/calendarWizard/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GenerateCalendarActionInput = {
  config: CalendarWizardConfig;
  replaceExisting?: boolean;
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
};

export type GenerateCalendarActionResult =
  | {
      status: "success";
      summary: CalendarCompletionSummary;
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
      status: "server_error";
      message: string;
      severity?: "high";
    };

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

type ExistingCalendarRow = {
  date: string;
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

function validateConfigShape(config: CalendarWizardConfig) {
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
    if ((specialDay.isInstructional ?? true) && !specialDay.scheduleId) {
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
  revalidatePath(`/${school}/app`);
  revalidatePath(`/${school}/app/schedule`);
  revalidatePath(`/${school}/schedule`);
  revalidatePath(`/${school}/kiosk`);
  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/app", "layout");
  revalidatePath("/[school]/kiosk", "page");
}

export async function generateCalendarAction(
  school: string,
  input: GenerateCalendarActionInput
): Promise<GenerateCalendarActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: schoolData } = await supabase
      .rpc("get_school_by_subdomain", {
        subdomain_input: school,
      })
      .single<{ id: string; name: string }>();

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

    return {
      status: "success",
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
