export const NOTIFICATION_PROCESSOR_BUDGET_MS = 240_000;
export const NOTIFICATION_FINALIZATION_RESERVE_MS = 30_000;
export const WEB_PUSH_SOCKET_TIMEOUT_MS = 15_000;
export const WEB_PUSH_HARD_TIMEOUT_MS = 16_000;

export type DeliveryStatus =
  | "pending" | "sending" | "sent" | "inbox_only"
  | "failed" | "disabled_subscription";

export class WebPushTimeoutError extends Error {
  constructor() {
    super("Web push exceeded its configured deadline");
    this.name = "WebPushTimeoutError";
  }
}

export function canStartProviderAttempt(
  startedAtMs: number,
  nowMs: number,
  processorBudgetMs = NOTIFICATION_PROCESSOR_BUDGET_MS
) {
  return nowMs + WEB_PUSH_HARD_TIMEOUT_MS + NOTIFICATION_FINALIZATION_RESERVE_MS
    <= startedAtMs + processorBudgetMs;
}

export async function withWebPushDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs = WEB_PUSH_HARD_TIMEOUT_MS
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WebPushTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isProvenUnattempted(status: DeliveryStatus) {
  return status === "pending";
}

export function summarizeCampaignDeliveries(
  statuses: DeliveryStatus[],
  eligible: number
) {
  const sent = statuses.filter((status) => status === "sent").length;
  const inboxOnly = statuses.filter((status) => status === "inbox_only").length;
  const disabled = statuses.filter((status) => status === "disabled_subscription").length;
  const failed = statuses.filter((status) => status === "failed").length + disabled;
  const pendingOrAmbiguous = statuses.filter(
    (status) => status === "pending" || status === "sending"
  ).length;
  const attempted = sent + failed;
  const status =
    eligible === 0
      ? "no_eligible_devices"
      : failed === 0 && sent > 0 && pendingOrAmbiguous === 0
      ? "sent"
      : sent + inboxOnly > 0
        ? failed > 0
          ? "partially_failed"
          : "sending"
        : failed > 0
          ? "failed"
          : "sending";
  return {
    status: status as
      | "sending" | "sent" | "partially_failed" | "failed"
      | "no_eligible_devices",
    eligible, attempted, sent, failed, inboxOnly, disabled, pendingOrAmbiguous,
  };
}
