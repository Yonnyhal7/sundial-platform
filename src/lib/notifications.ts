export const NOTIFICATION_CATEGORIES = [
  "emergency", "closure_delay", "important_announcement",
  "calendar_schedule_change", "school_event", "athletics",
  "student_activity", "academic_testing", "first_period_reminder",
  "period_change_reminder", "lunch_reminder", "end_of_day_reminder",
  "staff_announcement", "staff_meeting", "staff_duty", "operational_update",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_AUDIENCES = ["student", "parent", "staff"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  emergency: "Emergency alert", closure_delay: "Closure or delay",
  important_announcement: "Important announcement",
  calendar_schedule_change: "Calendar or schedule change",
  school_event: "School event", athletics: "Athletics",
  student_activity: "Club or student activity", academic_testing: "Academic or testing reminder",
  first_period_reminder: "First-period reminder", period_change_reminder: "Period-change reminder",
  lunch_reminder: "Lunch reminder", end_of_day_reminder: "End-of-day reminder",
  staff_announcement: "Staff announcement", staff_meeting: "Staff meeting",
  staff_duty: "Duty or supervision reminder", operational_update: "Operational update",
};

export const NOTIFICATION_CATEGORY_GROUPS = [
  { label: "Safety and Operations", categories: ["emergency", "closure_delay", "important_announcement", "calendar_schedule_change", "operational_update"] },
  { label: "Daily Schedule", categories: ["first_period_reminder", "period_change_reminder", "lunch_reminder", "end_of_day_reminder"] },
  { label: "School Community", categories: ["school_event", "athletics", "student_activity", "academic_testing"] },
  { label: "Staff", categories: ["staff_announcement", "staff_meeting", "staff_duty"] },
] as const satisfies ReadonlyArray<{ label: string; categories: readonly NotificationCategory[] }>;

export const AUDIENCE_CATEGORY_DEFAULTS: Record<NotificationAudience, Partial<Record<NotificationCategory, boolean>>> = {
  student: { emergency: true, closure_delay: true, important_announcement: true, calendar_schedule_change: true, first_period_reminder: true, period_change_reminder: false, lunch_reminder: false, end_of_day_reminder: false, school_event: true, athletics: false, student_activity: true, academic_testing: true },
  parent: { emergency: true, closure_delay: true, important_announcement: true, calendar_schedule_change: true, school_event: true, athletics: false, student_activity: false, academic_testing: true },
  staff: { emergency: true, closure_delay: true, important_announcement: true, calendar_schedule_change: true, staff_announcement: true, staff_meeting: true, staff_duty: true, operational_update: true, first_period_reminder: false, period_change_reminder: false, lunch_reminder: false, end_of_day_reminder: false, school_event: false },
};

export const NOTIFICATION_TEMPLATES = {
  fog_delay: { label: "Fog Delay", category: "closure_delay", title: "Fog delay", body: "School will begin on a delayed schedule today. Please check Sundial for updated times." },
  school_closed: { label: "School Closed", category: "closure_delay", title: "School closed", body: "School is closed today. Please check Sundial for additional updates." },
  late_start: { label: "Late Start", category: "calendar_schedule_change", title: "Late start", body: "School will follow a late-start schedule. Please review the updated bell times." },
  emergency_update: { label: "Emergency Update", category: "emergency", title: "Emergency update", body: "An important emergency update is available. Open Sundial for details." },
  emergency_cleared: { label: "Emergency Cleared", category: "emergency", title: "Emergency cleared", body: "The emergency condition has been cleared. Normal operations may resume." },
  schedule_change: { label: "Schedule Change", category: "calendar_schedule_change", title: "Schedule change", body: "The school schedule has changed. Open Sundial to review the latest times." },
  event_reminder: { label: "Event Reminder", category: "school_event", title: "School event reminder", body: "A school event is coming up. Open Sundial for details." },
  athletics_update: { label: "Athletics Update", category: "athletics", title: "Athletics update", body: "An athletics update is available. Open Sundial for details." },
  staff_announcement: { label: "Staff Announcement", category: "staff_announcement", title: "Staff announcement", body: "A new staff announcement is available in Sundial." },
} as const;

export function isNotificationCategory(value: string): value is NotificationCategory {
  return NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);
}

export function isNotificationAudience(value: string): value is NotificationAudience {
  return NOTIFICATION_AUDIENCES.includes(value as NotificationAudience);
}

export function resolveNotificationAudiences(values: string[], everyone = false) {
  if (everyone) return [...NOTIFICATION_AUDIENCES];
  return [...new Set(values.filter(isNotificationAudience))];
}

export function categoryAvailableForAudience(category: NotificationCategory, audience: NotificationAudience) {
  return Object.prototype.hasOwnProperty.call(AUDIENCE_CATEGORY_DEFAULTS[audience], category);
}

export function getRecommendedPreferences(audience: NotificationAudience) {
  return Object.entries(AUDIENCE_CATEGORY_DEFAULTS[audience]).map(([category, enabled]) => ({
    category: category as NotificationCategory,
    enabled: Boolean(enabled),
  }));
}

export function sanitizeNotificationText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeNotificationDestination(value: string, schoolSlug: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("..")) return null;
  const schoolRoot = `/${schoolSlug}`;
  return trimmed === schoolRoot || trimmed.startsWith(`${schoolRoot}/`)
    ? trimmed.slice(0, 500)
    : null;
}

export function schoolLocalDateTimeToUtc(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const desired = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const get = (type: Intl.DateTimeFormatPartTypes) => +(parts.find((part) => part.type === type)?.value || 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    instant += desired - represented;
  }
  const result = new Date(instant);
  const roundTrip = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(result);
  const get = (type: Intl.DateTimeFormatPartTypes) => roundTrip.find((part) => part.type === type)?.value;
  const roundTripValue = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  return roundTripValue === value ? result : null;
}
