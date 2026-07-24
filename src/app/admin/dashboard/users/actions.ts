"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSchoolSetupInvitationToken, getSchoolSetupInvitationExpiration, hashSchoolSetupInvitationToken } from "@/lib/invitations/tokens";
import { deliverSchoolSetupInvitation } from "@/lib/email/schoolSetupDelivery.server";
import { getPasswordRecoveryRedirectUrl } from "@/lib/auth/passwordRecovery.server";

export type UserActionState = { status: "idle" | "success" | "validation_error" | "stale" | "server_error"; message?: string };
export const INITIAL_USER_ACTION_STATE: UserActionState = { status: "idle" };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const databaseRole = (value: string) => value === "school_admin" ? "SchoolAdmin" : value === "editor" ? "Editor" : null;
type RpcResult = { status?: string };
function rpcState(data: RpcResult | null, error: unknown, success: string): UserActionState {
  if (error || !data) return { status: "server_error", message: "Sundial could not complete that user-management action." };
  if (data.status === "success") return { status: "success", message: success };
  if (data.status === "stale") return { status: "stale", message: "This membership changed elsewhere. Reload before saving." };
  const messages: Record<string, string> = { last_school_admin: "Every school must retain at least one active administrator.", duplicate_membership: "This user already belongs to that school.", unsupported_role: "That school role is not supported.", school_unavailable: "That school is archived or unavailable.", invalid_user: "That user no longer exists.", not_found: "That record no longer exists.", not_pending: "That invitation is no longer pending.", rate_limited: "Please wait before requesting another password-reset email." };
  return { status: "validation_error", message: messages[data.status || ""] || "The request was rejected." };
}

export async function addMembershipAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase } = await requireSuperAdminAccess(); const userId = String(formData.get("user_id") || ""), schoolId = String(formData.get("school_id") || ""), role = databaseRole(String(formData.get("role") || ""));
  if (!isUuid(userId) || !isUuid(schoolId) || !role) return { status: "validation_error", message: "Choose a valid user, school, and role." };
  const { data, error } = await supabase.rpc("add_school_membership", { p_user_id: userId, p_school_id: schoolId, p_role: role }).single<RpcResult>(); const state = rpcState(data, error, "School membership added."); if (state.status === "success") revalidatePath("/admin/dashboard/users", "layout"); return state;
}

export async function updateMembershipRoleAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase } = await requireSuperAdminAccess(); const membershipId = String(formData.get("membership_id") || ""), version = Number(formData.get("version")), role = databaseRole(String(formData.get("role") || ""));
  if (!isUuid(membershipId) || !Number.isSafeInteger(version) || !role) return { status: "validation_error", message: "That role change is invalid." };
  const { data, error } = await supabase.rpc("update_school_membership_role", { p_membership_id: membershipId, p_expected_version: version, p_role: role }).single<RpcResult>(); const state = rpcState(data, error, "School role updated."); if (state.status === "success") revalidatePath("/admin/dashboard/users", "layout"); return state;
}

export async function removeMembershipAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase } = await requireSuperAdminAccess(); const membershipId = String(formData.get("membership_id") || ""), version = Number(formData.get("version"));
  if (!isUuid(membershipId) || !Number.isSafeInteger(version)) return { status: "validation_error", message: "That membership removal is invalid." };
  const { data, error } = await supabase.rpc("remove_school_membership", { p_membership_id: membershipId, p_expected_version: version }).single<RpcResult>(); const state = rpcState(data, error, "School membership removed. The Auth identity was retained."); if (state.status === "success") revalidatePath("/admin/dashboard/users", "layout"); return state;
}

export async function invitePlatformUserAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase, profile } = await requireSuperAdminAccess(); const schoolId = String(formData.get("school_id") || ""), email = String(formData.get("email") || "").trim().toLowerCase(), role = databaseRole(String(formData.get("role") || ""));
  if (!isUuid(schoolId) || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "validation_error", message: "Enter a valid email, school, and role." };
  const service = createSupabaseServiceRoleClient(); const { data: existing } = await service.from("users").select("id").ilike("email", email).maybeSingle<{ id: string }>();
  if (existing) {
    const { data, error } = await supabase.rpc("add_school_membership", { p_user_id: existing.id, p_school_id: schoolId, p_role: role }).single<RpcResult>(); const state = rpcState(data, error, "Existing user added to the selected school."); if (state.status === "success") revalidatePath("/admin/dashboard/users", "layout"); return state;
  }
  const { data: conflict } = await service.from("pending_admin_invites").select("id").eq("school_id", schoolId).ilike("email", email).in("status", ["pending", "accepting"]).is("used_at", null).is("canceled_at", null).maybeSingle();
  if (conflict) return { status: "validation_error", message: "A pending invitation already exists for this email and school." };
  const rawToken = createSchoolSetupInvitationToken(), tokenHash = hashSchoolSetupInvitationToken(rawToken), expiresAt = getSchoolSetupInvitationExpiration();
  const { data: invitation, error: insertError } = await service.from("pending_admin_invites").insert({ school_id: schoolId, email, invite_token: tokenHash, expires_at: expiresAt.toISOString(), status: "pending", role: "school_admin", requested_role: role, created_by: profile.id }).select("id").single<{ id: string }>();
  if (insertError || !invitation) return { status: "server_error", message: "The invitation could not be created." };
  await service.from("platform_user_audit").insert({ actor_id: profile.id, school_id: schoolId, invitation_id: invitation.id, action: "invitation_created", summary: "Created school invitation", new_values: { role } });
  const delivery = await deliverSchoolSetupInvitation({ supabase, inviteId: invitation.id, schoolId, rawToken, tokenHash, expiresAt, rotateToken: false });
  revalidatePath("/admin/dashboard/users", "layout"); return delivery.status === "sent" ? { status: "success", message: "Invitation sent." } : { status: "server_error", message: delivery.message };
}

export async function resendPlatformInvitationAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase, profile } = await requireSuperAdminAccess(); const inviteId = String(formData.get("invitation_id") || ""), schoolId = String(formData.get("school_id") || ""); if (!isUuid(inviteId) || !isUuid(schoolId)) return { status: "validation_error", message: "That invitation is invalid." };
  const rawToken = createSchoolSetupInvitationToken(), tokenHash = hashSchoolSetupInvitationToken(rawToken), expiresAt = getSchoolSetupInvitationExpiration(); const delivery = await deliverSchoolSetupInvitation({ supabase, inviteId, schoolId, rawToken, tokenHash, expiresAt, rotateToken: true });
  if (delivery.status === "sent") await createSupabaseServiceRoleClient().from("platform_user_audit").insert({ actor_id: profile.id, school_id: schoolId, invitation_id: inviteId, action: "invitation_resent", summary: "Resent school invitation" }); revalidatePath("/admin/dashboard/users", "layout"); return delivery.status === "sent" ? { status: "success", message: delivery.message } : { status: "server_error", message: delivery.message };
}

export async function cancelPlatformInvitationAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase } = await requireSuperAdminAccess(); const inviteId = String(formData.get("invitation_id") || ""), schoolId = String(formData.get("school_id") || ""); if (!isUuid(inviteId) || !isUuid(schoolId)) return { status: "validation_error", message: "That invitation is invalid." };
  const { data, error } = await supabase.rpc("cancel_platform_user_invitation", { p_invitation_id: inviteId, p_school_id: schoolId }).single<RpcResult>(); const state = rpcState(data, error, "Invitation canceled."); if (state.status === "success") revalidatePath("/admin/dashboard/users", "layout"); return state;
}

export async function sendPlatformPasswordResetAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  const { supabase } = await requireSuperAdminAccess(); const userId = String(formData.get("user_id") || ""); if (!isUuid(userId)) return { status: "validation_error", message: "That password-reset request is invalid." };
  const { data: claim, error } = await supabase.rpc("claim_platform_password_reset_audit", { p_user_id: userId }).single<RpcResult>(); const state = rpcState(claim, error, "If the account can receive email, reset instructions were sent."); if (state.status !== "success") return state;
  const { data: profile } = await createSupabaseServiceRoleClient().from("users").select("email").eq("id", userId).maybeSingle<{ email: string | null }>(); if (profile?.email) await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo: getPasswordRecoveryRedirectUrl("/admin") }); return state;
}
