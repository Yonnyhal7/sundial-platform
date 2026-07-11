import type { DateString, Weekday } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isDateString(value: string): value is DateString {
  return DATE_PATTERN.test(value) && formatDateString(parseDateString(value)) === value;
}

export function parseDateString(value: DateString) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid date string: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateString(date: Date): DateString {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function compareDateStrings(a: DateString, b: DateString) {
  return a.localeCompare(b);
}

export function addDays(date: DateString, days: number): DateString {
  const parsed = parseDateString(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);

  return formatDateString(parsed);
}

export function eachDateInRange(startDate: DateString, endDate: DateString) {
  const dates: DateString[] = [];

  if (compareDateStrings(startDate, endDate) > 0) {
    return dates;
  }

  for (
    let cursor = startDate;
    compareDateStrings(cursor, endDate) <= 0;
    cursor = addDays(cursor, 1)
  ) {
    dates.push(cursor);
  }

  return dates;
}

export function getWeekday(date: DateString): Weekday {
  return parseDateString(date).getUTCDay() as Weekday;
}

export function rangesOverlap(
  aStart: DateString,
  aEnd: DateString,
  bStart: DateString,
  bEnd: DateString
) {
  return compareDateStrings(aStart, bEnd) <= 0 && compareDateStrings(bStart, aEnd) <= 0;
}

export function clampRangeToBounds(
  startDate: DateString,
  endDate: DateString,
  minDate: DateString,
  maxDate: DateString
) {
  const clampedStart =
    compareDateStrings(startDate, minDate) < 0 ? minDate : startDate;
  const clampedEnd = compareDateStrings(endDate, maxDate) > 0 ? maxDate : endDate;

  if (compareDateStrings(clampedStart, clampedEnd) > 0) {
    return null;
  }

  return {
    startDate: clampedStart,
    endDate: clampedEnd,
  };
}

export function daysBetweenInclusive(startDate: DateString, endDate: DateString) {
  const start = parseDateString(startDate).getTime();
  const end = parseDateString(endDate).getTime();

  return Math.floor((end - start) / MS_PER_DAY) + 1;
}
