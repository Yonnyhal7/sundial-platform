import "server-only";
import webpush from "web-push";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPushEnvironment } from "./env.server";

type Campaign = {
  id: string; school_id: string; title: string; body: string; category: string;
  destination_url: string | null; claim_token: string | null;
};
type Device = { id: string; audience: string };
type Subscription = {
  id: string; device_id: string; endpoint: string; p256dh: string; auth: string;
  expiration_time: number | null; failure_count: number;
};
type Delivery = {
  device_id: string;
  delivery_status: "pending" | "sending" | "sent" | "inbox_only" | "failed" | "disabled_subscription";
};

function providerFailure(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode) : 0;
  return { code: statusCode ? `web_push_${statusCode}` : "web_push_failed", disable: statusCode === 404 || statusCode === 410 };
}

export async function processNotificationQueue(campaignId?: string) {
  const env = getPushEnvironment();
  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  const db = createSupabaseServiceRoleClient();
  const { data: claimed, error } = await db.rpc("claim_notification_campaign", { p_campaign_id: campaignId || null });
  if (error) throw new Error("Unable to claim notification work");

  for (const campaign of (claimed || []) as Campaign[]) {
    const { data: school } = await db.from("schools").select("subdomain,archived_at").eq("id", campaign.school_id).maybeSingle();
    if (!school || school.archived_at) {
      await db.from("notification_campaigns").update({ status: "failed", failed_count: 1 }).eq("id", campaign.id).eq("claim_token", campaign.claim_token);
      continue;
    }
    const { data: audienceRows } = await db.from("notification_campaign_audiences").select("audience").eq("school_id", campaign.school_id).eq("campaign_id", campaign.id);
    const audiences = (audienceRows || []).map((row) => row.audience);
    const { data: devices } = await db.from("notification_devices").select("id,audience").eq("school_id", campaign.school_id).in("audience", audiences).is("revoked_at", null);
    const deviceRows = (devices || []) as Device[];
    const deviceIds = deviceRows.map((device) => device.id);
    const { data: prefs } = deviceIds.length ? await db.from("notification_device_preferences").select("device_id,enabled").eq("school_id", campaign.school_id).eq("category", campaign.category).in("device_id", deviceIds) : { data: [] };
    const enabled = new Set((prefs || []).filter((pref) => pref.enabled).map((pref) => pref.device_id));
    const eligible = deviceRows.filter((device) => enabled.has(device.id));
    if (eligible.length) {
      await db.from("notification_deliveries").upsert(eligible.map((device) => ({ school_id: campaign.school_id, campaign_id: campaign.id, device_id: device.id, audience: device.audience })), { onConflict: "campaign_id,device_id", ignoreDuplicates: true });
    }
    const eligibleIds = eligible.map((device) => device.id);
    const { data: existingDeliveries } = eligibleIds.length
      ? await db.from("notification_deliveries").select("device_id,delivery_status").eq("school_id", campaign.school_id).eq("campaign_id", campaign.id).in("device_id", eligibleIds)
      : { data: [] };
    const terminalDevices = new Set(
      ((existingDeliveries || []) as Delivery[])
        .filter((delivery) => ["sent", "inbox_only", "disabled_subscription"].includes(delivery.delivery_status))
        .map((delivery) => delivery.device_id)
    );
    const pendingEligible = eligible.filter((device) => !terminalDevices.has(device.id));
    const pendingIds = pendingEligible.map((device) => device.id);
    const { data: subscriptions } = pendingIds.length ? await db.from("push_subscriptions").select("id,device_id,endpoint,p256dh,auth,expiration_time,failure_count").eq("school_id", campaign.school_id).in("device_id", pendingIds).is("disabled_at", null) : { data: [] };
    const byDevice = new Map(((subscriptions || []) as Subscription[]).map((subscription) => [subscription.device_id, subscription]));
    for (const device of pendingEligible) {
      const subscription = byDevice.get(device.id);
      if (!subscription) {
        await db.from("notification_deliveries").update({ delivery_status: "inbox_only" }).eq("campaign_id", campaign.id).eq("device_id", device.id);
        continue;
      }
      await db.from("notification_deliveries").update({ delivery_status: "sending" }).eq("campaign_id", campaign.id).eq("device_id", device.id);
      try {
        const response = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth }, expirationTime: subscription.expiration_time ?? undefined }, JSON.stringify({ campaignId: campaign.id, title: campaign.title, body: campaign.body, category: campaign.category, schoolSlug: school.subdomain, destinationPath: campaign.destination_url || `/${school.subdomain}/app` }), { TTL: 86400, urgency: campaign.category === "emergency" ? "high" : "normal" });
        await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id).eq("school_id", campaign.school_id);
        await db.from("notification_deliveries").update({ delivery_status: "sent", delivered_at: new Date().toISOString(), provider_message_id: response.headers?.location?.slice(0, 200) || null }).eq("campaign_id", campaign.id).eq("device_id", device.id);
      } catch (caught) {
        const reason = providerFailure(caught);
        await db.from("push_subscriptions").update({ last_failure_at: new Date().toISOString(), failure_count: subscription.failure_count + 1, disabled_at: reason.disable ? new Date().toISOString() : null }).eq("id", subscription.id).eq("school_id", campaign.school_id);
        await db.from("notification_deliveries").update({ delivery_status: reason.disable ? "disabled_subscription" : "failed", failed_at: new Date().toISOString(), failure_reason: reason.code }).eq("campaign_id", campaign.id).eq("device_id", device.id);
      }
    }
    const { data: completedDeliveries } = await db.from("notification_deliveries").select("delivery_status").eq("school_id", campaign.school_id).eq("campaign_id", campaign.id);
    const statuses = (completedDeliveries || []).map((delivery) => delivery.delivery_status);
    const sent = statuses.filter((status) => status === "sent").length;
    const inboxOnly = statuses.filter((status) => status === "inbox_only").length;
    const disabled = statuses.filter((status) => status === "disabled_subscription").length;
    const failed = statuses.filter((status) => status === "failed").length + disabled;
    const attempted = sent + failed;
    const finalStatus = failed === 0 ? "sent" : sent + inboxOnly > 0 ? "partially_failed" : "failed";
    await db.from("notification_campaigns").update({ status: finalStatus, sent_at: new Date().toISOString(), eligible_count: eligible.length, attempted_count: attempted, successful_count: sent, failed_count: failed, disabled_subscription_count: disabled, updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("school_id", campaign.school_id).eq("claim_token", campaign.claim_token);
    await db.from("notification_audit").insert({ school_id: campaign.school_id, campaign_id: campaign.id, action: "campaign_delivery_completed", summary: `Delivery completed with status ${finalStatus}`, new_values: { eligible: eligible.length, attempted, sent, failed, inbox_only: inboxOnly, disabled }, result_status: finalStatus === "failed" ? "failed" : "success" });
  }
  return { processed: (claimed || []).length };
}
