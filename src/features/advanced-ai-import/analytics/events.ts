export const ADVANCED_IMPORT_EVENTS = {
  opened: "advanced_import_opened",
  started: "advanced_import_started",
  uploadCompleted: "advanced_import_upload_completed",
  completed: "advanced_import_completed",
  failed: "advanced_import_failed",
} as const;

export type AdvancedImportEvent = typeof ADVANCED_IMPORT_EVENTS[keyof typeof ADVANCED_IMPORT_EVENTS];

export function trackAdvancedImportEvent(event: AdvancedImportEvent, metadata: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent(event, { detail: metadata }));
  console.info("[Advanced Import] Analytics", { event, ...metadata });
}
