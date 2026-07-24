"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSchoolAdminPath, requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { isNotificationCategory, resolveNotificationAudiences, sanitizeNotificationDestination, sanitizeNotificationText, schoolLocalDateTimeToUtc } from "@/lib/notifications";
import { processNotificationQueue } from "@/lib/notifications/service.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

async function authorized(school: string) {
  const schoolData = await getSchoolForSetup(school);
  if (!schoolData) throw new Error("School unavailable");
  const admin = await requireAdminSectionAccess(schoolData.id, "notifications", school);
  return { schoolData, admin };
}

export async function createNotificationCampaignAction(school: string, formData: FormData) {
  const { schoolData, admin } = await authorized(school);
  const schoolTimeZone = schoolData.timezone || "America/Los_Angeles";
  const category = String(formData.get("category") || "");
  const audiences = resolveNotificationAudiences(formData.getAll("audiences").map(String), formData.get("everyone") === "on");
  const intent = String(formData.get("intent") || "draft");
  const status = intent === "schedule" ? "scheduled" : intent === "send" ? "queued" : "draft";
  const scheduled = status === "scheduled" ? schoolLocalDateTimeToUtc(String(formData.get("scheduled_for") || ""), schoolTimeZone) : null;
  const title = sanitizeNotificationText(formData.get("title"), 60);
  const body = sanitizeNotificationText(formData.get("body"), 180);
  if (!isNotificationCategory(category) || audiences.length === 0 || !title || !body || (status === "scheduled" && !scheduled)) {
    redirect(`${await getSchoolAdminPath(school)}/notifications/new?error=validation`);
  }
  const { data } = await admin.supabase.rpc("create_notification_campaign", {
    p_school_id: schoolData.id, p_title: title, p_body: body, p_category: category,
    p_audiences: audiences, p_status: status, p_scheduled_for: scheduled?.toISOString() || null,
    p_origin_timezone: schoolTimeZone, p_urgency: category === "emergency" ? "emergency" : "normal",
    p_destination_url: sanitizeNotificationDestination(String(formData.get("destination_url") || ""), school),
    p_related_entity_type: null, p_related_entity_id: null, p_target_type: "audience",
    p_followed_entity_type: null, p_followed_entity_id: null,
    p_idempotency_key: String(formData.get("idempotency_key") || randomUUID()),
  }) as { data: { status?: string; campaign_id?: string } | null };
  if (!data?.campaign_id || !["success", "duplicate"].includes(data.status || "")) {
    redirect(`${await getSchoolAdminPath(school)}/notifications/new?error=${encodeURIComponent(data?.status || "server_error")}`);
  }
  if (status === "queued" && data.status === "success") {
    processNotificationQueue(data.campaign_id).catch(() => undefined);
  }
  redirect(`${await getSchoolAdminPath(school)}/notifications/${data.campaign_id}`);
}

export async function cancelNotificationCampaignAction(school: string, campaignId: string, version: number) {
  const { schoolData, admin } = await authorized(school);
  await admin.supabase.rpc("cancel_notification_campaign", { p_campaign_id: campaignId, p_school_id: schoolData.id, p_expected_version: version });
  revalidatePath(`/${school}/admin/notifications/${campaignId}`);
}

export async function rescheduleNotificationCampaignAction(school: string, campaignId: string, version: number, formData: FormData) {
  const { schoolData, admin } = await authorized(school);
  const timezone = schoolData.timezone || "America/Los_Angeles";
  const scheduled = schoolLocalDateTimeToUtc(String(formData.get("scheduled_for") || ""), timezone);
  if (!scheduled) return;
  await admin.supabase.rpc("reschedule_notification_campaign", {
    p_campaign_id: campaignId, p_school_id: schoolData.id,
    p_expected_version: version, p_scheduled_for: scheduled.toISOString(),
    p_origin_timezone: timezone,
  });
  revalidatePath(`/${school}/admin/notifications/${campaignId}`);
}

export async function queueAnnouncementNotification(school: string, announcementId: string | null, titleValue: string, bodyValue: string) {
  const { schoolData, admin } = await authorized(school);
  const title = sanitizeNotificationText(titleValue, 60);
  const body = sanitizeNotificationText(bodyValue, 180);
  if (!title || !body) return { status: "validation_error" };
  const { data } = await admin.supabase.rpc("create_notification_campaign", {
    p_school_id: schoolData.id, p_title: title, p_body: body,
    p_category: "important_announcement", p_audiences: ["student", "parent", "staff"],
    p_status: "queued", p_scheduled_for: null,
    p_origin_timezone: schoolData.timezone || "America/Los_Angeles", p_urgency: "normal",
    p_destination_url: `/${school}/app/announcements`,
    p_related_entity_type: announcementId ? "announcement" : null, p_related_entity_id: announcementId,
    p_target_type: "audience", p_followed_entity_type: null, p_followed_entity_id: null,
    p_idempotency_key: randomUUID(),
  }) as { data: { status?: string; campaign_id?: string } | null };
  if (data?.status === "success" && data.campaign_id) processNotificationQueue(data.campaign_id).catch(() => undefined);
  return { status: data?.status || "server_error" };
}

export async function saveNotificationSettingsAction(school: string, version: number, formData: FormData) {
  const { schoolData, admin } = await authorized(school);
  const db = createSupabaseServiceRoleClient();
  await db.from("notification_school_settings").update({
    notifications_enabled: formData.get("notifications_enabled") === "on",
    scheduled_notifications_enabled: formData.get("scheduled_notifications_enabled") === "on",
    sender_display_name: sanitizeNotificationText(formData.get("sender_display_name"), 80) || null,
    updated_by: admin.profile.id, updated_at: new Date().toISOString(), version: version + 1,
  }).eq("school_id", schoolData.id).eq("version", version);
  revalidatePath(`/${school}/admin/notifications/settings`);
}
