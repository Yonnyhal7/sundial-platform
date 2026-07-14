import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260713140000_school_setup_invitation_delivery.sql"),
  "utf8"
).toLowerCase();

describe("school setup invitation migration", () => {
  it("stores only token hashes with expiry and single-use metadata", () => {
    expect(migration).toContain(
      "extensions.digest(invite_token::text, 'sha256'::text)"
    );
    expect(migration).toContain(
      "extensions.digest(new.invite_token::text, 'sha256'::text)"
    );
    expect(migration).toContain("hash_pending_admin_invite_token_before_write");
    expect(migration).toContain("add column if not exists expires_at");
    expect(migration).toContain("add column if not exists used_at");
    expect(migration).toContain("interval '7 days'");
  });

  it("uses the existing pgcrypto extension schema without search-path fallback", () => {
    expect(migration).toContain("e.extname = 'pgcrypto'");
    expect(migration).toContain("n.nspname = 'extensions'");
    expect(migration).not.toMatch(/\bcreate\s+extension\b[^;]*\bpgcrypto\b/);
    expect(migration).not.toMatch(/\balter\s+extension\b[^;]*\bpgcrypto\b/);

    for (const pgcryptoFunction of [
      "digest",
      "hmac",
      "gen_random_bytes",
      "gen_random_uuid",
      "crypt",
      "gen_salt",
      "armor",
      "dearmor",
      "pgp_sym_encrypt",
      "pgp_sym_decrypt",
      "pgp_pub_encrypt",
      "pgp_pub_decrypt",
      "pgp_key_id",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`(?<![\\w.])${pgcryptoFunction}\\s*\\(`)
      );
    }
  });

  it("tracks reliable delivery state and atomically prevents overlap", () => {
    for (const field of [
      "delivery_status",
      "delivery_attempt_count",
      "last_delivery_attempt_at",
      "delivery_locked_at",
      "provider_message_id",
      "delivery_failure_reason",
      "acceptance_session_hash",
      "acceptance_session_expires_at",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("claim_school_setup_invitation_delivery");
    expect(migration).toContain("for update");
    expect(migration).toContain("interval '60 seconds'");
    expect(migration).toContain("already_sending");
    expect(migration).toContain("acceptance_session_hash = case when p_rotate_token then null");
  });

  it("rechecks SuperAdmin, school identity, and archive state in both RPCs", () => {
    expect(migration.match(/current_user_is_super_admin\(\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain("i.school_id = p_school_id");
    expect(migration).toContain("v_school.archived_at is not null");
    expect(migration).toContain("s.archived_at is null");
    expect(migration).toContain("revoke all on function public.claim_school_setup_invitation_delivery");
    expect(migration).toContain("from public, anon");
  });

  it("keeps direct table access SuperAdmin-only and relies on lifecycle archive RLS", () => {
    expect(migration).toContain('create policy "superadmins can read setup invitations"');
    expect(migration).toContain('create policy "superadmins can update setup invitations"');
    expect(migration).not.toContain("grant select on public.pending_admin_invites to anon");
    expect(migration).not.toContain("grant update on public.pending_admin_invites to anon");
  });
});
