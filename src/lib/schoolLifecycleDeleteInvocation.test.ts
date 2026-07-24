import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");
const dialog = source(
  "src/app/admin/dashboard/schools/SchoolLifecycleDialog.tsx",
);
const actions = source("src/app/admin/dashboard/schools/lifecycle-actions.ts");
const migration = source(
  "supabase/migrations/20260724160000_reconcile_archived_school_deletion.sql",
).toLowerCase();

describe("archived school permanent deletion invocation", () => {
  it("uses an explicit submit boundary and classifies failures before a request result", () => {
    expect(dialog).toContain("event.preventDefault()");
    expect(dialog).toContain("new FormData(event.currentTarget)");
    expect(dialog).toMatch(/await action\(\s*EMPTY_LIFECYCLE_STATE/);
    expect(dialog).toContain('reason: "client_invocation_failure"');
    expect(dialog).toContain("The deletion request could not start");
    expect(dialog).toContain('type="submit"');
    expect(dialog).not.toContain("useActionState");
    expect(dialog).not.toContain("useFormStatus");
  });

  it("records safe client and server stages without tenant or form data", () => {
    for (const stage of [
      "delete_button_clicked",
      "validation_passed",
      "delete_handler_entered",
      "action_invocation_starting",
      "action_invocation_returned",
      "client_exception",
    ]) {
      expect(dialog).toContain(stage);
    }
    expect(actions).toContain("server_action_entered");
    expect(actions).toContain("deletion_transaction_started");
    expect(actions).not.toMatch(
      /console\.(?:info|warn|error)\([^)]*school\.(?:id|name|subdomain)/,
    );
  });

  it("distinguishes authorization, database, storage, and success results", () => {
    for (const reason of [
      "authorization_failure",
      "database_failure",
      "storage_cleanup_failure",
      "success",
    ]) {
      expect(actions).toContain(`reason: "${reason}"`);
    }
    expect(actions).toContain("safeDatabaseFailure");
    expect(actions).toContain("databaseObject");
  });

  it("deletes invitations and newer restrictive school relationships before the school", () => {
    const ordered = [
      "update public.platform_user_audit",
      "delete from public.notification_audit",
      "delete from public.calendar_days",
      "delete from public.school_timezone_audit",
      "delete from public.school_memberships",
      "delete from public.subscription_ledger_entries",
      "delete from public.founder_slot_claims",
      "delete from public.school_subscriptions",
      "delete from public.pending_admin_invites",
      "update public.users",
      "delete from public.schools",
    ];
    let previous = -1;
    for (const statement of ordered) {
      const position = migration.indexOf(statement);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it("retains an unknown-foreign-key guard and sanitized database diagnostics", () => {
    expect(migration).toContain(
      "constraint_row.confrelid = 'public.schools'::regclass",
    );
    expect(migration).toContain(
      "deletion blocked by unaudited school foreign keys",
    );
    expect(migration).toContain("get stacked diagnostics");
    expect(migration).toContain("constraint_name");
    expect(migration).toContain("table_name");
    expect(migration).not.toContain("sqlerrm");
  });
});
