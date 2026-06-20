"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateScheduleAction(
  school: string,
  schoolId: string,
  scheduleId: string,
  existingPeriodIds: string[],
  formData: FormData
) {
  const supabase = await createSupabaseServerClient();

  const scheduleName = String(formData.get("schedule_name") || "");
  const scheduleType = String(formData.get("schedule_type") || "");
  const active = formData.get("active") === "on";

  const { error: scheduleError } = await supabase
    .from("schedules")
    .update({
      schedule_name: scheduleName,
      schedule_type: scheduleType || null,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId)
    .eq("school_id", schoolId);

  if (scheduleError) {
    console.error("Update schedule error:", JSON.stringify(scheduleError, null, 2));
    return;
  }

  const periodIds = formData.getAll("period_id").map(String);
  const periodNames = formData.getAll("period_name").map(String);
  const startTimes = formData.getAll("start_time").map(String);
  const endTimes = formData.getAll("end_time").map(String);

  const submittedExistingIds = periodIds.filter((id) => !id.startsWith("new-"));

  const deletedPeriodIds = existingPeriodIds.filter(
    (id) => !submittedExistingIds.includes(id)
  );

  if (deletedPeriodIds.length > 0) {
    const { error: deletePeriodsError } = await supabase
      .from("periods")
      .delete()
      .in("id", deletedPeriodIds);

    if (deletePeriodsError) {
      console.error("Delete periods error:", JSON.stringify(deletePeriodsError, null, 2));
      return;
    }
  }

  for (let index = 0; index < periodNames.length; index++) {
    const periodId = periodIds[index];
    const name = periodNames[index];
    const startTime = startTimes[index];
    const endTime = endTimes[index];

    if (!name || !startTime || !endTime) continue;

    if (periodId.startsWith("new-")) {
      const { error: insertPeriodError } = await supabase
        .from("periods")
        .insert({
          schedule_id: scheduleId,
          name,
          start_time: startTime,
          end_time: endTime,
          sort_order: index + 1,
        });

      if (insertPeriodError) {
        console.error("Insert period error:", JSON.stringify(insertPeriodError, null, 2));
        return;
      }
    } else {
      const { error: updatePeriodError } = await supabase
        .from("periods")
        .update({
          name,
          start_time: startTime,
          end_time: endTime,
          sort_order: index + 1,
        })
        .eq("id", periodId)
        .eq("schedule_id", scheduleId);

      if (updatePeriodError) {
        console.error("Update period error:", JSON.stringify(updatePeriodError, null, 2));
        return;
      }
    }
  }

  redirect(`/${school}/admin/schedules`);
}