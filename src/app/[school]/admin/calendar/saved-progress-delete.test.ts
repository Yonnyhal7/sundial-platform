import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const action = read("src/app/[school]/admin/calendar/actions.ts");
const cards = read("src/app/[school]/admin/calendar/saved-progress-cards.tsx");
const page = read("src/app/[school]/admin/calendar/page.tsx");

describe("saved calendar wizard progress deletion", () => {
  it("keeps abandoned manual progress available after a separate AI-created calendar exists", () => {
    expect(page).toContain("loadCalendarWizardDraft(school, AI_CALENDAR_WIZARD_DRAFT_TYPE)");
    expect(page).toContain("loadCalendarWizardDraft(school, GUIDED_CALENDAR_WIZARD_DRAFT_TYPE)");
    expect(page).toContain("savedProgressCards");
    expect(cards).toContain("Delete Saved Progress");
  });

  it("deletes only the exact tenant and school-year draft without touching the published calendar", () => {
    const deletionAction = action.slice(
      action.indexOf("export async function deleteSavedCalendarProgressAction"),
      action.indexOf("export async function clearCalendarDayAction")
    );
    expect(action).toMatch(/\.from\("calendar_wizard_drafts"\)\s*\.delete\(\)/);
    expect(action).toContain('.eq("id", input.draftId)');
    expect(action).toContain('.eq("school_id", schoolData.id)');
    expect(action).toContain('.eq("school_year_label", input.schoolYearLabel)');
    expect(action).toContain('.is("school_year_label", null)');
    expect(deletionAction).not.toContain('.from("calendar_days")');
    expect(deletionAction).not.toContain('.from("schedules")');
  });

  it("protects deletion with calendar authorization for the resolved school", () => {
    expect(action).toMatch(/requireAdminSectionAccess\(\s*schoolData\.id,\s*"calendar",\s*school/);
    expect(action).toContain("get_available_school_by_subdomain");
    expect(action).toContain("if (error || !data)");
  });

  it("requires confirmation and supports cancel without invoking deletion", () => {
    expect(cards).toContain('role="dialog"');
    expect(cards).toContain("Delete this saved calendar setup?");
    expect(cards).toContain("Your unfinished wizard progress will be permanently deleted. Your existing calendar will not be affected.");
    expect(cards).toContain("Cancel");
    expect(cards).toContain("Delete Progress");
    expect(cards).toContain("onClick={closeDialog}");
    expect(cards).toContain('event.key === "Escape"');
  });

  it("keeps the card on failure for retry and removes it immediately only after success", () => {
    const failureGuard = cards.indexOf('result.status !== "success"');
    const removal = cards.indexOf("setCards((current) => current.filter", failureGuard);
    expect(failureGuard).toBeGreaterThan(-1);
    expect(removal).toBeGreaterThan(failureGuard);
    expect(cards.slice(failureGuard, removal)).toContain('setToast({ kind: "error"');
    expect(cards).toContain('message: "Saved calendar setup deleted."');
    expect(cards).toContain('role={toast.kind === "error" ? "alert" : "status"}');
  });

  it("keeps Resume, Start Over, and Delete Saved Progress as separate actions", () => {
    expect(cards).toContain(">Resume</Link>");
    expect(cards).toContain(">Start Over</Link>");
    expect(cards).toContain(">Delete Saved Progress</button>");
  });
});
