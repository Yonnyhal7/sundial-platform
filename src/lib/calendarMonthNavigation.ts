const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export function normalizeCalendarMonthKey(value: string | null | undefined) {
  const match = value?.match(MONTH_KEY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  return month >= 1 && month <= 12
    ? `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`
    : null;
}

export function getAdjacentCalendarMonthKey(monthKey: string, offset: number) {
  const normalized = normalizeCalendarMonthKey(monthKey);
  if (!normalized) return null;

  const [year, month] = normalized.split("-").map(Number);
  const target = new Date(year, month - 1 + offset, 1);

  return `${target.getFullYear().toString().padStart(4, "0")}-${(target.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

export function getCalendarSwipeMonthOffset({
  deltaX,
  deltaY,
  elapsedMs,
}: {
  deltaX: number;
  deltaY: number;
  elapsedMs: number;
}) {
  if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return 0;

  const velocity = Math.abs(deltaX) / Math.max(elapsedMs, 1);
  const completed =
    Math.abs(deltaX) >= 64 || (Math.abs(deltaX) >= 34 && velocity >= 0.4);

  if (!completed) return 0;
  return deltaX < 0 ? 1 : -1;
}
