import "server-only";

import webpush from "web-push";
import { formatDateInTimeZone } from "@/lib/localDate";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getPushEnvironment } from "./env.server";
import {
  filterPeriodReminderDevices,
  getDuePeriodReminderCandidates,
  PERIOD_REMINDER_CATEGORY,
  processPeriodReminderSchoolsIndependently,
  resolvePeriodReminderCandidates,
  type PeriodReminderSettings,
} from "./periodReminders";
import {
  WEB_PUSH_HARD_TIMEOUT_MS,
  WEB_PUSH_SOCKET_TIMEOUT_MS,
  withWebPushDeadline,
} from "./processorPolicy";

type EnabledSettings = PeriodReminderSettings & { school_id: string };
type Device = {
  id: string;
  audience: "student" | "parent" | "staff";
  permission_status: string;
};
type Subscription = {
  id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  failure_count: number;
};

function diagnostic(
  event: string,
  values: Record<string, string | number | boolean | null> = {},
  error = false,
) {
  const message = JSON.stringify({
    scope: "period_reminder_processor",
    event,
    ...values,
  });
  if (error) console.error(message);
  else console.info(message);
}

function providerFailure(error: unknown) {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return {
    code: statusCode ? `web_push_${statusCode}` : "web_push_failed",
    disable: statusCode === 404 || statusCode === 410,
  };
}

export async function processAutomaticPeriodReminders(now = new Date()) {
  const db = createSupabaseServiceRoleClient();
  const { data: settingRows, error: settingsError } = await db
    .from("notification_school_settings")
    .select(
      "school_id,notifications_enabled,period_reminders_enabled,period_reminder_minutes_before,period_reminder_audiences",
    )
    .eq("notifications_enabled", true)
    .eq("period_reminders_enabled", true)
    .limit(100);
  if (settingsError) throw new Error("Period reminder settings unavailable");
  const settings = (settingRows || []) as EnabledSettings[];
  if (!settings.length) return { schools: 0, processed: 0, failed: 0 };

  const { data: schools, error: schoolsError } = await db
    .from("schools")
    .select("id,subdomain,timezone,archived_at")
    .in(
      "id",
      settings.map((row) => row.school_id),
    )
    .is("archived_at", null);
  if (schoolsError) throw new Error("Period reminder schools unavailable");
  const schoolById = new Map(
    (schools || []).map((school) => [school.id, school]),
  );
  const env = getPushEnvironment();
  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);

  return processPeriodReminderSchoolsIndependently(
    settings,
    async (schoolSettings) => {
      const school = schoolById.get(schoolSettings.school_id);
      if (!school) return 0;
      const scheduleDate = formatDateInTimeZone(now, school.timezone);
      const { data: calendarDay, error: dayError } = await db
        .from("calendar_days")
        .select("school_id,date,schedule_id,is_school_day")
        .eq("school_id", school.id)
        .eq("date", scheduleDate)
        .maybeSingle();
      if (dayError) throw new Error("Calendar day unavailable");
      if (!calendarDay?.schedule_id || calendarDay.is_school_day === false)
        return 0;

      const [
        { data: schedule, error: scheduleError },
        { data: periods, error: periodsError },
      ] = await Promise.all([
        db
          .from("schedules")
          .select("id,school_id,active,setup_status")
          .eq("id", calendarDay.schedule_id)
          .eq("school_id", school.id)
          .maybeSingle(),
        db
          .from("periods")
          .select("id,name,start_time,end_time,sort_order")
          .eq("schedule_id", calendarDay.schedule_id)
          .eq("school_id", school.id),
      ]);
      if (scheduleError || periodsError)
        throw new Error("Assigned schedule unavailable");
      const due = getDuePeriodReminderCandidates(
        resolvePeriodReminderCandidates({
          school: {
            id: school.id,
            subdomain: school.subdomain,
            timezone: school.timezone,
          },
          settings: schoolSettings,
          calendarDay,
          schedule,
          periods: periods || [],
        }),
        now,
      );

      let processed = 0;
      for (const candidate of due) {
        const { data: run, error: claimError } = await db
          .from("notification_period_reminder_runs")
          .insert({
            school_id: candidate.schoolId,
            schedule_date: candidate.scheduleDate,
            schedule_id: candidate.scheduleId,
            period_id: candidate.periodId,
            lead_time_minutes: candidate.leadMinutes,
            scheduled_for: candidate.reminderAt.toISOString(),
            period_starts_at: candidate.periodStart.toISOString(),
            title: candidate.title,
            body: candidate.body,
            audiences: candidate.audiences,
            status: "processing",
          })
          .select("id")
          .maybeSingle();
        if (claimError && (claimError as { code?: string }).code === "23505")
          continue;
        if (claimError || !run) throw new Error("Period reminder claim failed");
        processed += 1;
        diagnostic("run_claimed", {
          school_id: school.id,
          schedule_date: candidate.scheduleDate,
          period_id: candidate.periodId,
        });

        try {
          const { data: deviceRows, error: deviceError } = await db
            .from("notification_devices")
            .select("id,audience,permission_status")
            .eq("school_id", school.id)
            .in("audience", candidate.audiences)
            .is("revoked_at", null);
          if (deviceError)
            throw new Error("Period reminder devices unavailable");
          const devices = (deviceRows || []) as Device[];
          const deviceIds = devices.map((device) => device.id);
          const [
            { data: preferences, error: preferenceError },
            { data: subscriptions, error: subscriptionError },
          ] = deviceIds.length
            ? await Promise.all([
                db
                  .from("notification_device_preferences")
                  .select("device_id,enabled")
                  .eq("school_id", school.id)
                  .eq("category", PERIOD_REMINDER_CATEGORY)
                  .eq("enabled", true)
                  .in("device_id", deviceIds),
                db
                  .from("push_subscriptions")
                  .select(
                    "id,device_id,endpoint,p256dh,auth,expiration_time,failure_count",
                  )
                  .eq("school_id", school.id)
                  .in("device_id", deviceIds)
                  .is("disabled_at", null),
              ])
            : [
                { data: [], error: null },
                { data: [], error: null },
              ];
          if (preferenceError || subscriptionError)
            throw new Error("Period reminder eligibility unavailable");
          const subscriptionRows = (subscriptions || []) as Subscription[];
          const subscriptionByDevice = new Map(
            subscriptionRows.map((subscription) => [
              subscription.device_id,
              subscription,
            ]),
          );
          const eligible = filterPeriodReminderDevices(
            devices,
            candidate.audiences,
            (preferences || []).map((preference) => preference.device_id),
            subscriptionRows.map((subscription) => subscription.device_id),
          );
          if (eligible.length) {
            const { error } = await db
              .from("notification_period_reminder_deliveries")
              .insert(
                eligible.map((device) => ({
                  school_id: school.id,
                  run_id: run.id,
                  device_id: device.id,
                  audience: device.audience,
                })),
              );
            if (error)
              throw new Error("Period reminder delivery rows unavailable");
          }

          let successful = 0;
          let failed = 0;
          for (const device of eligible) {
            const subscription = subscriptionByDevice.get(device.id);
            if (!subscription) continue;
            const attemptAt = new Date().toISOString();
            await db
              .from("notification_period_reminder_deliveries")
              .update({ delivery_status: "sending", updated_at: attemptAt })
              .eq("run_id", run.id)
              .eq("school_id", school.id)
              .eq("device_id", device.id);
            try {
              const response = await withWebPushDeadline(
                () =>
                  webpush.sendNotification(
                    {
                      endpoint: subscription.endpoint,
                      keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth,
                      },
                      expirationTime: subscription.expiration_time ?? undefined,
                    },
                    JSON.stringify({
                      campaignId: `period-reminder-${run.id}`,
                      title: candidate.title,
                      body: candidate.body,
                      category: PERIOD_REMINDER_CATEGORY,
                      schoolSlug: school.subdomain,
                      destinationPath: candidate.destinationPath,
                    }),
                    {
                      TTL: 600,
                      urgency: "normal",
                      timeout: WEB_PUSH_SOCKET_TIMEOUT_MS,
                    },
                  ),
                WEB_PUSH_HARD_TIMEOUT_MS,
              );
              successful += 1;
              const deliveredAt = new Date().toISOString();
              await Promise.all([
                db
                  .from("push_subscriptions")
                  .update({ last_success_at: deliveredAt, failure_count: 0 })
                  .eq("id", subscription.id)
                  .eq("school_id", school.id),
                db
                  .from("notification_period_reminder_deliveries")
                  .update({
                    delivery_status: "sent",
                    delivered_at: deliveredAt,
                    provider_message_id:
                      response.headers?.location?.slice(0, 200) || null,
                    updated_at: deliveredAt,
                  })
                  .eq("run_id", run.id)
                  .eq("school_id", school.id)
                  .eq("device_id", device.id),
              ]);
            } catch (caught) {
              failed += 1;
              const failure = providerFailure(caught);
              const failedAt = new Date().toISOString();
              await Promise.all([
                db
                  .from("push_subscriptions")
                  .update({
                    last_failure_at: failedAt,
                    failure_count: subscription.failure_count + 1,
                    disabled_at: failure.disable ? failedAt : null,
                  })
                  .eq("id", subscription.id)
                  .eq("school_id", school.id),
                db
                  .from("notification_period_reminder_deliveries")
                  .update({
                    delivery_status: failure.disable
                      ? "disabled_subscription"
                      : "failed",
                    failed_at: failedAt,
                    failure_reason: failure.code,
                    updated_at: failedAt,
                  })
                  .eq("run_id", run.id)
                  .eq("school_id", school.id)
                  .eq("device_id", device.id),
              ]);
              diagnostic(
                "delivery_failed",
                { school_id: school.id, run_id: run.id, reason: failure.code },
                true,
              );
            }
          }
          const status =
            eligible.length === 0
              ? "no_eligible_devices"
              : failed === 0
                ? "sent"
                : successful > 0
                  ? "partially_failed"
                  : "failed";
          await db
            .from("notification_period_reminder_runs")
            .update({
              status,
              eligible_count: eligible.length,
              successful_count: successful,
              failed_count: failed,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", run.id)
            .eq("school_id", school.id);
          diagnostic("run_completed", {
            school_id: school.id,
            run_id: run.id,
            status,
            eligible: eligible.length,
            successful,
            failed,
          });
        } catch (caught) {
          const failedAt = new Date().toISOString();
          await db
            .from("notification_period_reminder_runs")
            .update({
              status: "failed",
              failed_count: 1,
              completed_at: failedAt,
              updated_at: failedAt,
            })
            .eq("id", run.id)
            .eq("school_id", school.id);
          diagnostic(
            "run_failed",
            { school_id: school.id, run_id: run.id },
            true,
          );
          throw caught;
        }
      }
      return processed;
    },
  );
}
