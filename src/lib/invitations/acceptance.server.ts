import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import {
  classifySchoolSetupInvitation,
  type SchoolSetupInvitationStatus,
} from "./status";
import {
  createSchoolSetupInvitationToken,
  hashSchoolSetupInvitationToken,
  isPlausibleSchoolSetupInvitationToken,
} from "./tokens";

const ACCEPTANCE_SESSION_TTL_MS = 15 * 60 * 1000;

type InvitationDatabaseRow = {
  id: string;
  email: string;
  school_id: string;
  role: string | null;
  status: string;
  delivery_status: string;
  expires_at: string;
  used_at: string | null;
  acceptance_locked_at: string | null;
  acceptance_session_expires_at: string | null;
  schools:
    | {
        id: string;
        name: string;
        subdomain: string;
        archived_at: string | null;
      }
    | Array<{
        id: string;
        name: string;
        subdomain: string;
        archived_at: string | null;
      }>;
};

export type SchoolSetupInvitationView = {
  status: SchoolSetupInvitationStatus;
  schoolName?: string;
  email?: string;
  expiresAt?: string;
};

function schoolFor(row: InvitationDatabaseRow) {
  return Array.isArray(row.schools) ? row.schools[0] : row.schools;
}

function invitationRecord(row: InvitationDatabaseRow) {
  const school = schoolFor(row);
  if (!school) return null;
  return {
    status: row.status,
    delivery_status: row.delivery_status,
    expires_at: row.expires_at,
    used_at: row.used_at,
    acceptance_locked_at: row.acceptance_locked_at,
    school_subdomain: school.subdomain,
    school_archived_at: school.archived_at,
  };
}

function viewFor(row: InvitationDatabaseRow): SchoolSetupInvitationView {
  const school = schoolFor(row);
  const record = invitationRecord(row);
  if (!school || !record) return { status: "invalid" };
  const status = classifySchoolSetupInvitation(record, school.subdomain);
  return status === "valid"
    ? {
        status,
        schoolName: school.name,
        email: row.email,
        expiresAt: row.expires_at,
      }
    : { status };
}

function invitationSelect() {
  return "id, email, school_id, role, status, delivery_status, expires_at, used_at, acceptance_locked_at, acceptance_session_expires_at, schools!inner(id, name, subdomain, archived_at)";
}

async function findInvitationByRawToken(rawToken: string) {
  if (!isPlausibleSchoolSetupInvitationToken(rawToken)) return null;
  const supabase = createSupabaseServiceRoleClient();
  const tokenHash = hashSchoolSetupInvitationToken(rawToken);
  const { data } = await supabase
    .from("pending_admin_invites")
    .select(invitationSelect())
    .eq("invite_token", tokenHash)
    .maybeSingle<InvitationDatabaseRow>();
  return data ? { supabase, tokenHash, row: data } : null;
}

async function findInvitationByAcceptanceSession(sessionToken: string) {
  if (!isPlausibleSchoolSetupInvitationToken(sessionToken)) return null;
  const supabase = createSupabaseServiceRoleClient();
  const sessionHash = hashSchoolSetupInvitationToken(sessionToken);
  const { data } = await supabase
    .from("pending_admin_invites")
    .select(invitationSelect())
    .eq("acceptance_session_hash", sessionHash)
    .maybeSingle<InvitationDatabaseRow>();
  return data ? { supabase, sessionHash, row: data } : null;
}

export async function exchangeSchoolSetupInvitationToken(rawToken: string) {
  const result = await findInvitationByRawToken(rawToken);
  if (!result) return { view: { status: "invalid" } as SchoolSetupInvitationView };
  const view = viewFor(result.row);
  if (view.status !== "valid") return { view };

  const sessionToken = createSchoolSetupInvitationToken();
  const sessionHash = hashSchoolSetupInvitationToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + ACCEPTANCE_SESSION_TTL_MS);
  const { data } = await result.supabase
    .from("pending_admin_invites")
    .update({
      acceptance_session_hash: sessionHash,
      acceptance_session_expires_at: sessionExpiresAt.toISOString(),
    })
    .eq("id", result.row.id)
    .eq("school_id", result.row.school_id)
    .eq("invite_token", result.tokenHash)
    .eq("delivery_status", "sent")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle<{ id: string }>();

  return data
    ? { view, sessionToken, sessionExpiresAt }
    : { view: { status: "invalid" } as SchoolSetupInvitationView };
}

export async function getSchoolSetupInvitationViewFromSession(sessionToken: string) {
  const result = await findInvitationByAcceptanceSession(sessionToken);
  if (!result) return { status: "invalid" } as SchoolSetupInvitationView;
  if (
    !result.row.acceptance_session_expires_at ||
    new Date(result.row.acceptance_session_expires_at).getTime() <= Date.now()
  ) {
    return { status: "expired" } as SchoolSetupInvitationView;
  }
  return viewFor(result.row);
}

export async function acceptSchoolSetupInvitation({
  sessionToken,
  firstName,
  lastName,
  password,
}: {
  sessionToken: string;
  firstName: string;
  lastName: string;
  password: string;
}) {
  const result = await findInvitationByAcceptanceSession(sessionToken);
  if (!result) return { ok: false as const, reason: "invalid" as const };
  const { row, supabase, sessionHash } = result;
  const school = schoolFor(row);
  const record = invitationRecord(row);
  if (!school || !record) return { ok: false as const, reason: "invalid" as const };
  if (
    !row.acceptance_session_expires_at ||
    new Date(row.acceptance_session_expires_at).getTime() <= Date.now()
  ) {
    return { ok: false as const, reason: "expired" as const };
  }

  const status = classifySchoolSetupInvitation(record, school.subdomain);
  if (status !== "valid") return { ok: false as const, reason: status };

  const now = new Date();
  if (row.status === "accepting") {
    await supabase
      .from("pending_admin_invites")
      .update({ status: "pending", acceptance_locked_at: null })
      .eq("id", row.id)
      .eq("acceptance_session_hash", sessionHash)
      .eq("status", "accepting")
      .lt("acceptance_locked_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString());
  }

  const { data: claimed } = await supabase
    .from("pending_admin_invites")
    .update({ status: "accepting", acceptance_locked_at: now.toISOString() })
    .eq("id", row.id)
    .eq("school_id", school.id)
    .eq("acceptance_session_hash", sessionHash)
    .eq("status", "pending")
    .eq("delivery_status", "sent")
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .gt("acceptance_session_expires_at", now.toISOString())
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!claimed) return { ok: false as const, reason: "temporarily_locked" as const };

  const releaseClaim = async () => {
    await supabase
      .from("pending_admin_invites")
      .update({ status: "pending", acceptance_locked_at: null })
      .eq("id", row.id)
      .eq("status", "accepting")
      .eq("acceptance_locked_at", now.toISOString());
  };

  const fullName = `${firstName} ${lastName}`.trim();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, full_name: fullName },
  });
  if (authError || !authData.user) {
    await releaseClaim();
    return {
      ok: false as const,
      reason:
        authError?.code === "email_exists" || authError?.code === "user_already_exists"
          ? ("account_exists" as const)
          : ("account_error" as const),
    };
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: authData.user.id,
    school_id: school.id,
    email: row.email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    role: "school_admin",
    is_active: true,
  });
  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    await releaseClaim();
    return { ok: false as const, reason: "account_error" as const };
  }

  const usedAt = new Date().toISOString();
  const { data: completed } = await supabase
    .from("pending_admin_invites")
    .update({
      status: "accepted",
      used_at: usedAt,
      acceptance_locked_at: null,
      acceptance_session_hash: null,
      acceptance_session_expires_at: null,
    })
    .eq("id", row.id)
    .eq("school_id", school.id)
    .eq("status", "accepting")
    .eq("acceptance_locked_at", now.toISOString())
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!completed) {
    await supabase.from("users").delete().eq("id", authData.user.id);
    await supabase.auth.admin.deleteUser(authData.user.id);
    await releaseClaim();
    return { ok: false as const, reason: "account_error" as const };
  }

  return {
    ok: true as const,
    schoolSubdomain: school.subdomain,
    email: row.email,
  };
}
