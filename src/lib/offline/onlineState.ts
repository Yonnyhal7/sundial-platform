export function getHydrationSafeInitialOnlineState() {
  return true;
}

export function getBrowserOnlineState() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
