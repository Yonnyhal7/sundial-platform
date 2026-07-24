"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { deliverSchoolSetupInvitation } from "@/lib/email/schoolSetupDelivery.server";
import {
  createSchoolSetupInvitationToken,
  hashSchoolSetupInvitationToken,
} from "@/lib/invitations/tokens";

export type ResendInvitationState = {
  status?: string;
  message?: string;
  fallbackUrl?: string;
  expiresAt?: string;
  tokenRotated?: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resendSchoolSetupInvitationAction(
  _previousState: ResendInvitationState,
  formData: FormData
): Promise<ResendInvitationState> {
  const { supabase, profile } = await requireSuperAdminAccess();
  const inviteId = String(formData.get("inviteId") || "");
  const schoolId = String(formData.get("schoolId") || "");
  if (!isUuid(inviteId) || !isUuid(schoolId)) {
    return { status: "rejected", message: "The invitation request is invalid." };
  }
  const { data: invitation } = await supabase
    .from("pending_admin_invites")
    .select("status, expires_at, used_at, canceled_at")
    .eq("id", inviteId)
    .eq("school_id", schoolId)
    .maybeSingle<{
      status: string;
      expires_at: string;
      used_at: string | null;
      canceled_at: string | null;
    }>();
  if (!invitation) {
    return { status: "rejected", message: "This invitation cannot be resent." };
  }
  if (invitation.canceled_at) {
    return { status: "rejected", message: "This invitation was canceled and cannot be resent." };
  }
  if (invitation.used_at || invitation.status === "accepted") {
    return { status: "rejected", message: "This invitation has already been used." };
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return {
      status: "rejected",
      message: "This invitation has expired. Create a new invitation instead.",
    };
  }
  const audit = createSupabaseServiceRoleClient();
  await audit.from("platform_user_audit").insert({
    actor_id: profile.id,
    school_id: schoolId,
    invitation_id: inviteId,
    action: "invitation_resend_requested",
    summary: "Requested school invitation resend",
  });

  const rawToken = createSchoolSetupInvitationToken();
  const tokenHash = hashSchoolSetupInvitationToken(rawToken);
  // Resend replaces the secret but preserves the original lifetime. Passing the
  // existing future expiration also prevents an invitation that expires during
  // the claim from being revived by the database function.
  const expiresAt = new Date(invitation.expires_at);
  const result = await deliverSchoolSetupInvitation({
    supabase,
    inviteId,
    schoolId,
    rawToken,
    tokenHash,
    expiresAt,
    rotateToken: true,
  });
  const response =
    result.fallbackUrl || !_previousState.fallbackUrl
      ? result
      : {
          ...result,
          fallbackUrl: _previousState.fallbackUrl,
          expiresAt: _previousState.expiresAt,
          tokenRotated: _previousState.tokenRotated,
        };
  await audit.from("platform_user_audit").insert({
    actor_id: profile.id,
    school_id: schoolId,
    invitation_id: inviteId,
    action: result.status === "sent" ? "invitation_delivery_succeeded" : "invitation_delivery_failed",
    summary:
      result.status === "sent"
        ? "School invitation delivery succeeded"
        : "School invitation delivery did not succeed",
    result_status: result.status === "sent" ? "success" : "blocked",
    new_values: {
      delivery_status: result.status,
      token_rotated: result.tokenRotated === true,
      fallback_link_generated: Boolean(result.fallbackUrl),
    },
  });
  if (result.fallbackUrl) {
    await audit.from("platform_user_audit").insert({
      actor_id: profile.id,
      school_id: schoolId,
      invitation_id: inviteId,
      action: "invitation_fallback_generated",
      summary: "Generated current school invitation fallback link",
      new_values: {
        token_rotated: result.tokenRotated === true,
        expires_at: result.expiresAt,
      },
    });
  }
  revalidatePath("/admin/dashboard/schools");
  return response;
}
