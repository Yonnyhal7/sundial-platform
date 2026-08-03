export const IMPORT_WORKSPACE_DIRECTORIES = ["source", "rendered-pages", "classification", "extraction", "builder", "verification", "validation", "review", "final", "diagnostics"] as const;

export function sourcePdfPath() { return "source/calendar.pdf"; }
export function sourceMetadataPath() { return "source/metadata.json"; }
export function renderedPagePath(page: number) { return `rendered-pages/page-${String(page).padStart(3, "0")}.png`; }
export function renderedPageMetadataPath(page: number) { return `rendered-pages/page-${String(page).padStart(3, "0")}.json`; }
