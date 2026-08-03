import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalSchoolSetupInvitationUrl } from "@/lib/routing/canonicalUrls";
import { getSchoolEmailConfig } from "./config.server";
import { renderSchoolSetupEmail } from "./schoolSetupEmail";
import { DEFAULT_SCHOOL_SETUP_EMAIL_PROVIDER, isSchoolSetupEmailProvider, type SchoolSetupEmailProvider } from "@/lib/platformSettings";
import { sendSchoolSetupEmail, SCHOOL_SETUP_SENDER_PROFILES } from "./schoolSetupProviders.server";

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
  fallbackUrl?: string;
  expiresAt?: string;
  tokenRotated?: boolean;
  provider?: SchoolSetupEmailProvider;
  providerMessageId?: string | null;
  from?: string;
  errorCode?: string | null;
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

async function activeProvider(supabase:SupabaseClient):Promise<SchoolSetupEmailProvider>{
  if(typeof supabase.from!=="function")return DEFAULT_SCHOOL_SETUP_EMAIL_PROVIDER;
  const {data}=await supabase.from("platform_settings").select("school_setup_email_provider").eq("id",true).maybeSingle<{school_setup_email_provider:string}>();
  return isSchoolSetupEmailProvider(data?.school_setup_email_provider)?data.school_setup_email_provider:DEFAULT_SCHOOL_SETUP_EMAIL_PROVIDER;
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
  let config: ReturnType<typeof getSchoolEmailConfig> | null = null;
  try {
    config = getSchoolEmailConfig();
  } catch {
    config = null;
  }
  const fallbackUrl = getCanonicalSchoolSetupInvitationUrl({
    adminUrl:
      config?.adminUrl || process.env.SUNDIAL_ADMIN_URL || "http://localhost:3000/admin",
    token: rawToken,
  });

  let success = false;
  let providerMessageId: string | null = null;
  const provider=await activeProvider(supabase);
  const profile=SCHOOL_SETUP_SENDER_PROFILES[provider];
  const from=`${profile.fromName} <${profile.fromEmail}>`;
  let errorCode:string|null="delivery_disabled";
  let failureReason = "Email delivery is disabled in this environment.";

  try {
    if (config && config.mode !== "disabled") {
      const content = renderSchoolSetupEmail({
        schoolName: claimed.school_name,
        setupUrl: fallbackUrl,
        expiresAt: new Date(claimed.expires_at),
      });
      const recipient=config.overrideTo??claimed.email;
      if(transport){
        const delivery=await transport.send({from,to:recipient,replyTo:profile.replyTo,...content,idempotencyKey:`school-setup-${claimed.invite_id}-${claimed.attempt_count}`});
        success=Boolean(delivery.id)&&!delivery.errorName;providerMessageId=success?delivery.id:null;errorCode=delivery.errorName;failureReason=sanitizedFailureReason(delivery.errorName);
      }else{
        const delivery=await sendSchoolSetupEmail(provider,{recipient,...content,idempotencyKey:`school-setup-${claimed.invite_id}-${claimed.attempt_count}`,metadata:{invitationId:claimed.invite_id,schoolId:claimed.school_id}});
        success=delivery.success;providerMessageId=delivery.providerMessageId;errorCode=delivery.errorCode;failureReason=delivery.errorMessage||"Email provider rejected the request.";
      }
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
    p_provider: provider,
    p_from_address: from,
    p_error_code: errorCode,
  });

  return success
    ? {
        status: "sent",
        message: rotateToken
          ? "The setup invitation was resent. A replacement link was created; older links no longer work."
          : "The setup invitation was sent.",
        fallbackUrl,
        expiresAt: claimed.expires_at,
        tokenRotated: rotateToken,
        provider, providerMessageId, from, errorCode:null,
      }
    : {
        status: "failed",
        message: rotateToken
          ? "Email delivery failed. A replacement invitation link is ready; older links no longer work."
          : "The setup email was not delivered. Use the invitation link below.",
        fallbackUrl,
        expiresAt: claimed.expires_at,
        tokenRotated: rotateToken,
        provider, providerMessageId:null, from, errorCode,
      };
}
