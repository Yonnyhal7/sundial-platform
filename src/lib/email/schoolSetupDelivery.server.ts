import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalSchoolSetupInvitationUrl } from "@/lib/routing/canonicalUrls";
import { getSchoolEmailConfig } from "./config.server";
import { renderSchoolSetupEmail } from "./schoolSetupEmail";

type ClaimedDelivery = {
  status: "claimed";
  invite_id: string;
  school_id: string;
  school_name: string;
  school_subdomain: string;
  email: string;
  expires_at: string;
  attempt_count: number;
};

type DeliveryClaim =
  | ClaimedDelivery
  | { status: string; retry_after_seconds?: number };

export type SchoolSetupDeliveryResult = {
  status: "sent" | "failed" | "rate_limited" | "already_sending" | "rejected";
  message: string;
};

export type SchoolSetupEmailTransport = {
  send(input: {
    from: string;
    to: string;
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ id: string | null; errorName: string | null }>;
};

function sanitizedFailureReason(errorName: string | null) {
  const safeNames = new Set([
    "application_error",
    "concurrent_idempotent_requests",
    "daily_quota_exceeded",
    "internal_server_error",
    "invalid_access",
    "invalid_api_key",
    "invalid_from_address",
    "monthly_quota_exceeded",
    "rate_limit_exceeded",
    "restricted_api_key",
    "validation_error",
  ]);
  return errorName && safeNames.has(errorName)
    ? `Email provider rejected the request (${errorName}).`
    : "Email provider rejected the request.";
}

function createResendTransport(apiKey: string): SchoolSetupEmailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(input) {
      const { data, error } = await resend.emails.send(
        {
          from: input.from,
          to: input.to,
          replyTo: input.replyTo,
          subject: input.subject,
          html: input.html,
          text: input.text,
        },
        { idempotencyKey: input.idempotencyKey }
      );
      return { id: data?.id ?? null, errorName: error?.name ?? null };
    },
  };
}

export async function deliverSchoolSetupInvitation({
  supabase,
  inviteId,
  schoolId,
  rawToken,
  tokenHash,
  expiresAt,
  rotateToken,
  transport,
}: {
  supabase: SupabaseClient;
  inviteId: string;
  schoolId: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
  rotateToken: boolean;
  transport?: SchoolSetupEmailTransport;
}): Promise<SchoolSetupDeliveryResult> {
  const { data, error } = await supabase.rpc("claim_school_setup_invitation_delivery", {
    p_invite_id: inviteId,
    p_school_id: schoolId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt.toISOString(),
    p_rotate_token: rotateToken,
  });
  const claim = data as DeliveryClaim | null;

  if (error || !claim) {
    return { status: "rejected", message: "The invitation could not be prepared for delivery." };
  }
  if (claim.status === "rate_limited") {
    return {
      status: "rate_limited",
      message: `Please wait ${claim.retry_after_seconds ?? 60} seconds before trying again.`,
    };
  }
  if (claim.status === "already_sending") {
    return { status: "already_sending", message: "This invitation is already being sent." };
  }
  if (claim.status !== "claimed") {
    return { status: "rejected", message: "This invitation cannot be sent." };
  }
  const claimed = claim as ClaimedDelivery;

  let success = false;
  let providerMessageId: string | null = null;
  let failureReason = "Email delivery is disabled in this environment.";

  try {
    const config = getSchoolEmailConfig();
    if (config.mode !== "disabled" && config.apiKey && config.from && config.replyTo) {
      const setupUrl = getCanonicalSchoolSetupInvitationUrl({
        adminUrl: config.adminUrl,
        token: rawToken,
      });
      const content = renderSchoolSetupEmail({
        schoolName: claimed.school_name,
        setupUrl,
        expiresAt: new Date(claimed.expires_at),
      });
      const delivery = await (transport ?? createResendTransport(config.apiKey)).send({
        from: config.from,
        to: config.overrideTo ?? claimed.email,
        replyTo: config.replyTo,
        ...content,
        idempotencyKey: `school-setup-${claimed.invite_id}-${claimed.attempt_count}`,
      });
      success = Boolean(delivery.id) && !delivery.errorName;
      providerMessageId = success ? delivery.id : null;
      failureReason = sanitizedFailureReason(delivery.errorName);
    }
  } catch {
    failureReason = "Email delivery configuration or provider request failed.";
  }

  await supabase.rpc("complete_school_setup_invitation_delivery", {
    p_invite_id: inviteId,
    p_school_id: schoolId,
    p_attempt_count: claimed.attempt_count,
    p_success: success,
    p_provider_message_id: providerMessageId,
    p_failure_reason: failureReason,
  });

  return success
    ? { status: "sent", message: "The setup invitation was sent." }
    : {
        status: "failed",
        message: "The school was created, but the setup email was not delivered.",
      };
}
