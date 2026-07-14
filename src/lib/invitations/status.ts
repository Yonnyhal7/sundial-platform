export type SchoolSetupInvitationRecord = {
  status: string;
  delivery_status: string;
  expires_at: string;
  used_at: string | null;
  acceptance_locked_at: string | null;
  school_subdomain: string;
  school_archived_at: string | null;
};

export type SchoolSetupInvitationStatus =
  | "valid"
  | "invalid"
  | "expired"
  | "already_used"
  | "temporarily_locked";

export function classifySchoolSetupInvitation(
  invitation: SchoolSetupInvitationRecord | null,
  expectedSchool: string,
  now = new Date()
): SchoolSetupInvitationStatus {
  if (
    !invitation ||
    invitation.school_archived_at ||
    invitation.school_subdomain !== expectedSchool ||
    invitation.delivery_status !== "sent"
  ) {
    return "invalid";
  }
  if (invitation.used_at || invitation.status === "accepted") return "already_used";
  if (new Date(invitation.expires_at).getTime() <= now.getTime()) return "expired";
  if (invitation.status === "accepting") {
    const lockTime = invitation.acceptance_locked_at
      ? new Date(invitation.acceptance_locked_at).getTime()
      : 0;
    if (lockTime > now.getTime() - 10 * 60 * 1000) return "temporarily_locked";
  }
  return invitation.status === "pending" || invitation.status === "accepting"
    ? "valid"
    : "invalid";
}
