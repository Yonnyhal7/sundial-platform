import "server-only";
import webpush from "web-push";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPushEnvironment } from "./env.server";
import {
  NOTIFICATION_PROCESSOR_BUDGET_MS,
  WEB_PUSH_HARD_TIMEOUT_MS,
  WEB_PUSH_SOCKET_TIMEOUT_MS,
  WebPushTimeoutError,
  canStartProviderAttempt,
  isProvenUnattempted,
  summarizeCampaignDeliveries,
  withWebPushDeadline,
  type DeliveryStatus,
} from "./processorPolicy";

type Campaign = {
  id: string; school_id: string; title: string; body: string; category: string;
  destination_url: string | null; claim_token: string | null;
  send_attempt_count: number;
};
type Device = { id: string; audience: string };
type Subscription = {
  id: string; device_id: string; endpoint: string; p256dh: string; auth: string;
  expiration_time: number | null; failure_count: number;
};
type Delivery = { device_id: string; delivery_status: DeliveryStatus };
type Outcome = "completed" | "partial" | "failed" | "timed_out" | "interrupted";
type DbResponse<T> = PromiseLike<{ data: T; error: unknown }>;

class NotificationDatabaseError extends Error {
  constructor(readonly operation: string) {
    super(`Notification database operation failed: ${operation}`);
  }
}

function diagnostic(
  event: string,
  values: Record<string, string | number | boolean | null> = {},
  error = false
) {
  const message = JSON.stringify({ scope: "notification_processor", event, ...values });
  if (error) console.error(message);
  else console.info(message);
}

async function checked<T>(operation: string, response: DbResponse<T>) {
  const result = await response;
  if (result.error) {
    diagnostic("database_operation_failed", { operation }, true);
    throw new NotificationDatabaseError(operation);
  }
  return result.data;
}

async function checkedRows<T extends { id: unknown }>(
  operation: string,
  response: DbResponse<T[] | null>
) {
  const rows = await checked(operation, response);
  if (!rows?.length) {
    diagnostic("database_operation_affected_no_rows", { operation }, true);
    throw new NotificationDatabaseError(operation);
  }
  return rows;
}

function providerFailure(error: unknown) {
  if (error instanceof WebPushTimeoutError) {
    return { code: "web_push_timeout", disable: false, timedOut: true };
  }
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode) : 0;
  return {
    code: statusCode ? `web_push_${statusCode}` : "web_push_failed",
    disable: statusCode === 404 || statusCode === 410,
    timedOut: false,
  };
}

async function finalizeCampaign(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  campaign: Campaign,
  eligible: number,
  requestedOutcome: Outcome
) {
  diagnostic("campaign_finalization_started", { requested_outcome: requestedOutcome });
  let statuses: DeliveryStatus[] = [];
  let finalizationFailed = false;
  try {
    const rows = await checked(
      "read_delivery_aggregates",
      db.from("notification_deliveries").select("delivery_status")
        .eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
    );
    statuses = (rows || []).map((row) => row.delivery_status as DeliveryStatus);
  } catch {
    finalizationFailed = true;
  }

  const totals = summarizeCampaignDeliveries(statuses, eligible);
  const outcome: Outcome = finalizationFailed ? "interrupted"
    : requestedOutcome === "completed" && totals.status === "partially_failed" ? "partial"
    : requestedOutcome === "completed" && totals.status === "failed" ? "failed"
    : requestedOutcome;
  const completedAt = new Date().toISOString();

  try {
    await checkedRows(
      "finalize_campaign",
      db.from("notification_campaigns").update({
        status: totals.status,
        sent_at: completedAt,
        eligible_count: eligible,
        attempted_count: totals.attempted,
        successful_count: totals.sent,
        failed_count: totals.failed,
        disabled_subscription_count: totals.disabled,
        updated_at: completedAt,
      }).eq("id", campaign.id).eq("school_id", campaign.school_id)
        .eq("claim_token", campaign.claim_token).select("id")
    );
  } catch {
    finalizationFailed = true;
  }

  try {
    await checked(
      "insert_campaign_finalization_audit",
      db.from("notification_audit").insert({
        school_id: campaign.school_id,
        campaign_id: campaign.id,
        action: finalizationFailed
          ? "campaign_delivery_finalization_failed" : "campaign_delivery_completed",
        summary: finalizationFailed
          ? "Notification delivery finalization could not be fully persisted."
          : `Delivery processing finished with status ${totals.status}.`,
        new_values: {
          outcome, eligible,
          attempted: totals.attempted, sent: totals.sent, failed: totals.failed,
          inbox_only: totals.inboxOnly, disabled: totals.disabled,
          pending_or_ambiguous: totals.pendingOrAmbiguous,
          duplicate_protection: "automatic_retry_suppressed_after_attempt",
        },
        result_status: finalizationFailed || totals.status === "failed"
          ? "failed" : "success",
      })
    );
  } catch {
    finalizationFailed = true;
  }
  if (finalizationFailed) {
    diagnostic("campaign_finalization_failed", { outcome }, true);
    throw new NotificationDatabaseError("campaign_finalization");
  }
  diagnostic("campaign_finalized", {
    status: totals.status, outcome, eligible, attempted: totals.attempted,
  });
}

export async function processNotificationQueue(campaignId?: string) {
  const startedAt = Date.now();
  diagnostic("processor_start", {
    budget_ms: NOTIFICATION_PROCESSOR_BUDGET_MS,
    targeted: Boolean(campaignId),
  });
  const env = getPushEnvironment();
  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  const db = createSupabaseServiceRoleClient();
  const claimed = await checked(
    "claim_campaign",
    db.rpc("claim_notification_campaign", { p_campaign_id: campaignId || null })
  );

  for (const campaign of (claimed || []) as Campaign[]) {
    let eligibleCount = 0;
    let outcome: Outcome = "completed";
    diagnostic("campaign_claimed", {
      stale_recovery: campaign.send_attempt_count > 1,
      remaining_budget_ms: Math.max(
        0, startedAt + NOTIFICATION_PROCESSOR_BUDGET_MS - Date.now()
      ),
    });
    if (campaign.send_attempt_count > 1) diagnostic("stale_campaign_recovered");
    try {
      const school = await checked(
        "read_campaign_school",
        db.from("schools").select("subdomain,archived_at")
          .eq("id", campaign.school_id).maybeSingle()
      );
      if (!school || school.archived_at) {
        outcome = "failed";
        continue;
      }
      const audienceRows = await checked(
        "read_campaign_audiences",
        db.from("notification_campaign_audiences").select("audience")
          .eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
      );
      const audiences = (audienceRows || []).map((row) => row.audience);
      const devices = await checked(
        "read_audience_devices",
        db.from("notification_devices").select("id,audience")
          .eq("school_id", campaign.school_id).in("audience", audiences)
          .is("revoked_at", null)
      );
      const deviceRows = (devices || []) as Device[];
      const deviceIds = deviceRows.map((device) => device.id);
      const prefs = deviceIds.length ? await checked(
        "read_device_preferences",
        db.from("notification_device_preferences").select("device_id,enabled")
          .eq("school_id", campaign.school_id).eq("category", campaign.category)
          .in("device_id", deviceIds)
      ) : [];
      const enabled = new Set(
        (prefs || []).filter((pref) => pref.enabled).map((pref) => pref.device_id)
      );
      const eligible = deviceRows.filter((device) => enabled.has(device.id));
      eligibleCount = eligible.length;

      if (eligible.length) await checked(
        "create_delivery_rows",
        db.from("notification_deliveries").upsert(
          eligible.map((device) => ({
            school_id: campaign.school_id, campaign_id: campaign.id,
            device_id: device.id, audience: device.audience,
          })),
          { onConflict: "campaign_id,device_id", ignoreDuplicates: true }
        )
      );
      const existingDeliveries = eligible.length ? await checked(
        "read_existing_deliveries",
        db.from("notification_deliveries").select("device_id,delivery_status")
          .eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
          .in("device_id", eligible.map((device) => device.id))
      ) : [];
      const statusByDevice = new Map(
        ((existingDeliveries || []) as Delivery[]).map((delivery) => [
          delivery.device_id, delivery.delivery_status,
        ])
      );
      const pendingEligible = eligible.filter((device) =>
        isProvenUnattempted(statusByDevice.get(device.id) || "pending")
      );
      const pendingIds = pendingEligible.map((device) => device.id);
      const subscriptions = pendingIds.length ? await checked(
        "read_push_subscriptions",
        db.from("push_subscriptions")
          .select("id,device_id,endpoint,p256dh,auth,expiration_time,failure_count")
          .eq("school_id", campaign.school_id).in("device_id", pendingIds)
          .is("disabled_at", null)
      ) : [];
      const byDevice = new Map(
        ((subscriptions || []) as Subscription[]).map((subscription) => [
          subscription.device_id, subscription,
        ])
      );

      for (const device of pendingEligible) {
        const remainingBudget = startedAt + NOTIFICATION_PROCESSOR_BUDGET_MS - Date.now();
        if (!canStartProviderAttempt(startedAt, Date.now())) {
          outcome = "timed_out";
          diagnostic("processor_budget_exhausted", {
            remaining_budget_ms: Math.max(0, remainingBudget),
          });
          break;
        }
        const subscription = byDevice.get(device.id);
        if (!subscription) {
          await checkedRows(
            "persist_inbox_only_delivery",
            db.from("notification_deliveries").update({ delivery_status: "inbox_only" })
              .eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
              .eq("device_id", device.id).select("id")
          );
          diagnostic("delivery_persisted", { status: "inbox_only" });
          continue;
        }

        await checkedRows(
          "mark_delivery_sending",
          db.from("notification_deliveries").update({ delivery_status: "sending" })
            .eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
            .eq("device_id", device.id).select("id")
        );
        diagnostic("delivery_attempt_started", {
          remaining_budget_ms: Math.max(0, remainingBudget),
        });
        try {
          const response = await withWebPushDeadline(
            () => webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
                expirationTime: subscription.expiration_time ?? undefined,
              },
              JSON.stringify({
                campaignId: campaign.id, title: campaign.title, body: campaign.body,
                category: campaign.category, schoolSlug: school.subdomain,
                destinationPath: campaign.destination_url || `/${school.subdomain}/app`,
              }),
              {
                TTL: 86400,
                urgency: campaign.category === "emergency" ? "high" : "normal",
                timeout: WEB_PUSH_SOCKET_TIMEOUT_MS,
              }
            ),
            WEB_PUSH_HARD_TIMEOUT_MS
          );
          await checkedRows(
            "record_subscription_success",
            db.from("push_subscriptions").update({
              last_success_at: new Date().toISOString(), failure_count: 0,
            }).eq("id", subscription.id).eq("school_id", campaign.school_id)
              .select("id")
          );
          await checkedRows(
            "persist_sent_delivery",
            db.from("notification_deliveries").update({
              delivery_status: "sent",
              delivered_at: new Date().toISOString(),
              provider_message_id: response.headers?.location?.slice(0, 200) || null,
            }).eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
              .eq("device_id", device.id).select("id")
          );
          diagnostic("delivery_persisted", { status: "sent" });
        } catch (caught) {
          if (caught instanceof NotificationDatabaseError) throw caught;
          const reason = providerFailure(caught);
          outcome = reason.timedOut ? "timed_out" : "failed";
          diagnostic(reason.timedOut ? "provider_timeout" : "provider_failure",
            reason.timedOut ? {} : { reason: reason.code });
          await checkedRows(
            "record_subscription_failure",
            db.from("push_subscriptions").update({
              last_failure_at: new Date().toISOString(),
              failure_count: subscription.failure_count + 1,
              disabled_at: reason.disable ? new Date().toISOString() : null,
            }).eq("id", subscription.id).eq("school_id", campaign.school_id)
              .select("id")
          );
          await checkedRows(
            "persist_failed_delivery",
            db.from("notification_deliveries").update({
              delivery_status: reason.disable ? "disabled_subscription" : "failed",
              failed_at: new Date().toISOString(), failure_reason: reason.code,
            }).eq("school_id", campaign.school_id).eq("campaign_id", campaign.id)
              .eq("device_id", device.id).select("id")
          );
          diagnostic("delivery_persisted", {
            status: reason.disable ? "disabled_subscription" : "failed",
          });
        }
      }
    } catch (caught) {
      outcome = caught instanceof NotificationDatabaseError ? "interrupted" : "failed";
      diagnostic("campaign_processing_interrupted", { outcome }, true);
    } finally {
      try {
        await finalizeCampaign(db, campaign, eligibleCount, outcome);
      } catch {
        // Finalization already emitted diagnostics and attempted a sanitized audit.
      }
    }
  }
  return { processed: (claimed || []).length };
}

export async function cleanupNotificationDeviceInbox() {
  const db = createSupabaseServiceRoleClient();
  return checked(
    "cleanup_notification_device_inbox",
    db.rpc("cleanup_notification_device_inbox")
  );
}
