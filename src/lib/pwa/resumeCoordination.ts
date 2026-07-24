const APPLICATION_UPDATE_PENDING_ATTRIBUTE = "pwaApplicationUpdatePending";
let updateChecksInFlight = 0;
const updateCheckWaiters = new Set<() => void>();

export function markPwaApplicationUpdatePending() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset[APPLICATION_UPDATE_PENDING_ATTRIBUTE] = "true";
}

export function isPwaApplicationUpdatePending() {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.dataset[APPLICATION_UPDATE_PENDING_ATTRIBUTE] ===
    "true"
  );
}

export function markPwaUpdateCheckStarted() {
  updateChecksInFlight += 1;
}

export function markPwaUpdateCheckFinished() {
  updateChecksInFlight = Math.max(0, updateChecksInFlight - 1);
  if (updateChecksInFlight !== 0) return;

  for (const resolve of updateCheckWaiters) resolve();
  updateCheckWaiters.clear();
}

export function waitForPwaUpdateCheck() {
  if (updateChecksInFlight === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    updateCheckWaiters.add(resolve);
  });
}
