"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { deliverSchoolSetupInvitation } from "@/lib/email/schoolSetupDelivery.server";
import {
  createSchoolSetupInvitationToken,
  getSchoolSetupInvitationExpiration,
  hashSchoolSetupInvitationToken,
} from "@/lib/invitations/tokens";

export type ResendInvitationState = { status?: string; message?: string };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resendSchoolSetupInvitationAction(
  _previousState: ResendInvitationState,
  formData: FormData
): Promise<ResendInvitationState> {
  const { supabase } = await requireSuperAdminAccess();
  const inviteId = String(formData.get("inviteId") || "");
  const schoolId = String(formData.get("schoolId") || "");
  if (!isUuid(inviteId) || !isUuid(schoolId)) {
    return { status: "rejected", message: "The invitation request is invalid." };
  }

  const rawToken = createSchoolSetupInvitationToken();
  const tokenHash = hashSchoolSetupInvitationToken(rawToken);
  const expiresAt = getSchoolSetupInvitationExpiration();
  const result = await deliverSchoolSetupInvitation({
    supabase,
    inviteId,
    schoolId,
    rawToken,
    tokenHash,
    expiresAt,
    rotateToken: true,
  });
  revalidatePath("/admin/dashboard/schools");
  return result;
}
