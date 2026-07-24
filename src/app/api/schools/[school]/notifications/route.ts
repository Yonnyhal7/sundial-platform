import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categoryAvailableForAudience, getRecommendedPreferences, isNotificationAudience, isNotificationCategory } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function context(request: Request, schoolSlug: string) {
  const installationId = request.headers.get("x-sundial-installation") || "";
  const token = request.headers.get("x-sundial-device-token") || "";
  if (!/^[\w-]{16,100}$/.test(installationId) || token.length < 32 || token.length > 200) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: school } = await db.from("schools").select("id,subdomain,archived_at").eq("subdomain", schoolSlug).maybeSingle();
  if (!school || school.archived_at) return null;
  const { data: device } = await db.from("notification_devices").select("id,school_id,user_id,audience,device_token_hash").eq("school_id", school.id).eq("installation_id", installationId).is("revoked_at", null).maybeSingle();
  if (!device) return { db, school, installationId, token, device: null };
  const actual = Buffer.from(device.device_token_hash, "hex");
  const expected = Buffer.from(tokenHash(token), "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { db, school, installationId, token, device };
}

async function authenticatedProfileForSchool(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  schoolId: string
) {
  const authDb = await createSupabaseServerClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from("users").select("id,school_id,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) return null;
  if (String(profile.role || "").replaceAll("_", "").toLowerCase() === "superadmin" || profile.school_id === schoolId) {
    return profile.id;
  }
  const { data: membership } = await db.from("school_memberships").select("id").eq("user_id", profile.id).eq("school_id", schoolId).eq("is_active", true).maybeSingle();
  return membership ? profile.id : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  const ctx = await context(request, school);
  if (!ctx?.device) return NextResponse.json({ error: "Device unavailable" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("view") === "preferences") {
    const { data } = await ctx.db.from("notification_device_preferences").select("category,enabled,lead_time_minutes").eq("school_id", ctx.school.id).eq("device_id", ctx.device.id);
    return NextResponse.json({ audience: ctx.device.audience, preferences: data || [] });
  }
  const { data } = await ctx.db.from("notification_deliveries").select("id,read_at,opened_at,created_at,notification_campaigns!inner(title,body,category,destination_url,status)").eq("school_id", ctx.school.id).eq("device_id", ctx.device.id).in("delivery_status", ["sent", "inbox_only"]).order("created_at", { ascending: false }).limit(100);
  const { count: unreadCount } = await ctx.db.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("school_id", ctx.school.id).eq("device_id", ctx.device.id).in("delivery_status", ["sent", "inbox_only"]).is("read_at", null);
  return NextResponse.json({
    audience: ctx.device.audience,
    notifications: data || [],
    unreadCount: unreadCount || 0,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  const ctx = await context(request, school);
  if (!ctx) return NextResponse.json({ error: "School or device unavailable" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || "");
  if (action === "register") {
    const audience = String(body?.audience || "");
    if (!isNotificationAudience(audience)) return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
    const userId = await authenticatedProfileForSchool(ctx.db, ctx.school.id);
    if (ctx.device) {
      if (ctx.device.user_id && userId && ctx.device.user_id !== userId) {
        return NextResponse.json({ error: "Device belongs to another account" }, { status: 409 });
      }
      if (ctx.device.audience !== audience) {
        return NextResponse.json({ error: "Device audience is already configured" }, { status: 409 });
      }
      const { error } = await ctx.db.from("notification_devices").update({
        user_id: ctx.device.user_id || userId,
        device_label: String(body?.deviceLabel || "").slice(0, 80) || null,
        platform: String(body?.platform || "unknown").slice(0, 40),
        browser: String(body?.browser || "unknown").slice(0, 40),
        pwa_installed: body?.pwaInstalled === true,
        notifications_supported: body?.notificationsSupported === true,
        permission_status: ["default", "granted", "denied", "unsupported"].includes(String(body?.permissionStatus)) ? body?.permissionStatus : "default",
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", ctx.device.id).eq("school_id", ctx.school.id);
      return error
        ? NextResponse.json({ error: "Unable to update device" }, { status: 409 })
        : NextResponse.json({ registered: true });
    }
    const { data: device, error } = await ctx.db.from("notification_devices").insert({ school_id: ctx.school.id, user_id: userId, installation_id: ctx.installationId, device_token_hash: tokenHash(ctx.token), audience, device_label: String(body?.deviceLabel || "").slice(0, 80) || null, platform: String(body?.platform || "unknown").slice(0, 40), browser: String(body?.browser || "unknown").slice(0, 40), pwa_installed: body?.pwaInstalled === true, notifications_supported: body?.notificationsSupported === true, permission_status: ["default", "granted", "denied", "unsupported"].includes(String(body?.permissionStatus)) ? body?.permissionStatus : "default" }).select("id").single();
    if (error || !device) return NextResponse.json({ error: "Unable to register device" }, { status: 409 });
    const { error: preferenceError } = await ctx.db.from("notification_device_preferences").insert(getRecommendedPreferences(audience).map((pref) => ({ school_id: ctx.school.id, device_id: device.id, ...pref })));
    if (preferenceError) {
      await ctx.db.from("notification_devices").delete().eq("id", device.id).eq("school_id", ctx.school.id);
      return NextResponse.json({ error: "Unable to initialize device preferences" }, { status: 409 });
    }
    return NextResponse.json({ registered: true }, { status: 201 });
  }
  if (!ctx.device) return NextResponse.json({ error: "Device unavailable" }, { status: 401 });
  if (action === "subscribe") {
    const subscription = body?.subscription as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
    if (!subscription || typeof subscription.endpoint !== "string" || !subscription.endpoint.startsWith("https://") || typeof subscription.keys?.p256dh !== "string" || typeof subscription.keys?.auth !== "string") return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    const endpoint = subscription.endpoint.slice(0, 2048);
    const replacedAt = new Date().toISOString();
    const { error: replacementError } = await ctx.db.from("push_subscriptions").update({ disabled_at: replacedAt, updated_at: replacedAt }).eq("school_id", ctx.school.id).eq("device_id", ctx.device.id).is("disabled_at", null).neq("endpoint", endpoint);
    if (replacementError) return NextResponse.json({ error: "Unable to replace subscription" }, { status: 400 });
    const { error } = await ctx.db.from("push_subscriptions").upsert({ school_id: ctx.school.id, device_id: ctx.device.id, endpoint, p256dh: subscription.keys.p256dh.slice(0, 512), auth: subscription.keys.auth.slice(0, 512), expiration_time: typeof subscription.expirationTime === "number" ? subscription.expirationTime : null, disabled_at: null, failure_count: 0, updated_at: replacedAt }, { onConflict: "device_id,endpoint" });
    return error ? NextResponse.json({ error: "Unable to save subscription" }, { status: 400 }) : NextResponse.json({ subscribed: true });
  }
  if (action === "preferences") {
    const preferences = Array.isArray(body?.preferences) ? body.preferences : [];
    const valid = preferences.filter((pref): pref is { category: string; enabled: boolean; leadTimeMinutes?: number | null } => {
      if (!pref || typeof pref !== "object") return false;
      const category = String((pref as { category?: unknown }).category);
      return isNotificationCategory(category)
        && isNotificationAudience(ctx.device!.audience)
        && categoryAvailableForAudience(category, ctx.device!.audience)
        && typeof (pref as { enabled?: unknown }).enabled === "boolean";
    });
    const { error } = await ctx.db.from("notification_device_preferences").upsert(valid.map((pref) => ({ school_id: ctx.school.id, device_id: ctx.device.id, category: pref.category, enabled: pref.enabled, lead_time_minutes: typeof pref.leadTimeMinutes === "number" ? Math.max(0, Math.min(10080, pref.leadTimeMinutes)) : null, updated_at: new Date().toISOString() })), { onConflict: "device_id,category" });
    return error
      ? NextResponse.json({ error: "Unable to save preferences" }, { status: 400 })
      : NextResponse.json({ saved: true });
  }
  if (action === "mark_read") {
    const deliveryId = String(body?.deliveryId || "");
    let query = ctx.db.from("notification_deliveries").update({ read_at: new Date().toISOString() }).eq("school_id", ctx.school.id).eq("device_id", ctx.device.id);
    query = deliveryId === "all" ? query.is("read_at", null) : query.eq("id", deliveryId);
    const { error } = await query;
    return error
      ? NextResponse.json({ error: "Unable to update inbox" }, { status: 400 })
      : NextResponse.json({ saved: true });
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
