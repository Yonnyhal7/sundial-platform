export type DateString = string;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PatternType = "same" | "repeating" | "weekday";

export type RotationBehavior = "advance" | "pause" | "restart";

export type SchoolYearRange = {
  name?: string;
  startDate: DateString;
  endDate: DateString;
  calendarCoverageStart?: DateString;
  calendarCoverageEnd?: DateString;
  instructionalStart?: DateString;
  instructionalEnd?: DateString;
};

export type CalendarDateClassification =
  | "instructional"
  | "no_school"
  | "staff_only"
  | "neutral_non_operating"
  | "removed_from_coverage";

export type CalendarDateClassificationOverride = {
  date: DateString;
  classification: CalendarDateClassification;
  scheduleId?: string | null;
  label?: string;
  sourceLabel?: string;
  confidence?: number;
  rotationBehavior?: RotationBehavior;
};

export type SameSchedulePattern = {
  type: "same";
  scheduleId: string;
};

export type RepeatingPattern = {
  type: "repeating";
  scheduleIds: string[];
  startIndex?: number;
};

export type WeekdayPattern = {
  type: "weekday";
  schedulesByWeekday: Partial<Record<Weekday, string>>;
};

export type CalendarSchedulePattern =
  | SameSchedulePattern
  | RepeatingPattern
  | WeekdayPattern;

export type DateRange = {
  startDate: DateString;
  endDate?: DateString;
};

export type NoSchoolRange = DateRange & {
  id?: string;
  label: string;
  type?: string;
};

export type SpecialSchoolDay = DateRange & {
  id?: string;
  scheduleId: string | null;
  label: string;
  isInstructional?: boolean;
  rotationBehavior?: RotationBehavior;
  assignmentSource?: "pdf_vector_fill" | "administrator" | "explicit_text" | "ai_inference" | "genuine_special";
};

export type DatedScheduleAssignment = {
  id?: string;
  date: DateString;
  scheduleId: string;
  source: "pdf_vector_fill" | "explicit_text" | "administrator";
  confidence: number;
  label?: string;
  rotationBehavior?: RotationBehavior;
};

export type InformationalDate = {
  id?: string;
  date: DateString;
  label: string;
};

export type CalendarWizardConfig = {
  schoolYear: SchoolYearRange;
  operatingWeekdays: Weekday[];
  pattern: CalendarSchedulePattern;
  noSchoolRanges?: NoSchoolRange[];
  specialDays?: SpecialSchoolDay[];
  datedScheduleAssignments?: DatedScheduleAssignment[];
  informationalDates?: InformationalDate[];
  dateClassifications?: CalendarDateClassificationOverride[];
};

export type GeneratedDaySource = {
  noSchoolRangeIds: string[];
  specialDayIds: string[];
  informationalDateIds: string[];
  datedScheduleAssignmentId?: string | null;
};

export type GeneratedCalendarDay = {
  date: DateString;
  weekday: Weekday;
  isOperatingDay: boolean;
  isSchoolDay: boolean;
  classification?: Exclude<CalendarDateClassification, "removed_from_coverage">;
  baseScheduleId: string | null;
  scheduleId: string | null;
  labels: string[];
  sources: GeneratedDaySource;
  warningCodes: CalendarGenerationWarningCode[];
  assignmentSource?: "pdf_vector_fill" | "administrator" | "explicit_text" | "genuine_special" | "pattern_generated" | "no_school" | "staff_only" | "neutral_non_operating" | null;
};

export type CalendarGenerationWarningCode =
  | "start_date_after_end_date"
  | "no_operating_weekdays"
  | "no_school_range_outside_year"
  | "special_day_outside_year"
  | "overlapping_no_school_ranges"
  | "overlapping_special_days"
  | "special_day_overlaps_no_school"
  | "instructional_day_missing_schedule"
  | "weekday_pattern_missing_schedule"
  | "repeating_pattern_missing_schedules"
  | "duplicate_special_day";

export type CalendarGenerationWarning = {
  code: CalendarGenerationWarningCode;
  message: string;
  dates?: DateString[];
  sourceIds?: string[];
};

export type CalendarGenerationSummary = {
  totalDatesInRange: number;
  instructionalDayCount: number;
  noSchoolWeekdayCount: number;
  weekendOrNonOperatingDayCount: number;
  countByBaseSchedule: Record<string, number>;
  countByActualSchedule: Record<string, number>;
  specialInstructionalDayCount: number;
  unassignedInstructionalDayCount: number;
  warningCount: number;
};

export type CalendarGenerationResult = {
  days: GeneratedCalendarDay[];
  warnings: CalendarGenerationWarning[];
  summary: CalendarGenerationSummary;
};
