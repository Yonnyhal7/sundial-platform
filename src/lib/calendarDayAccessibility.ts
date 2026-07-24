type CalendarDayAccessibilityInput = {
  longDateLabel: string;
  isToday: boolean;
  isSelected: boolean;
  isSchoolDay: boolean | null;
  scheduleName: string | null;
  scheduleType: string | null;
  label: string | null;
};

export function getCalendarDayAccessibleLabel({
  longDateLabel,
  isToday,
  isSelected,
  isSchoolDay,
  scheduleName,
  scheduleType,
  label,
}: CalendarDayAccessibilityInput) {
  const status =
    isSchoolDay === false
      ? label || "No School"
      : scheduleName
        ? scheduleType
          ? `${scheduleName}, ${scheduleType}`
          : scheduleName
        : "No schedule assigned";

  return [
    longDateLabel,
    isToday ? "Today" : null,
    status,
    isSelected ? "Selected" : null,
  ]
    .filter(Boolean)
    .join(". ");
}
