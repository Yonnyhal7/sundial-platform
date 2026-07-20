"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClearCalendarDayResult = {
  status: "success" | "error";
  message: string;
  date?: string;
};

export async function clearCalendarDayAction(school: string, date: string): Promise<ClearCalendarDayResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { status: "error", message: "Select a valid calendar date and try again." };
  }

  const lookupClient = await createSupabaseServerClient();
  const { data: schoolData } = await lookupClient.rpc("get_available_school_by_subdomain", {
    subdomain_input: school,
  }).maybeSingle<{ id: string }>();
  if (!schoolData) notFound();

  const { supabase } = await requireAdminSectionAccess(schoolData.id, "calendar", school);
  const { error } = await supabase
    .from("calendar_days")
    .delete()
    .eq("school_id", schoolData.id)
    .eq("date", date);

  if (error) {
    console.error("Clear calendar day error:", JSON.stringify(error, null, 2));
    return { status: "error", message: "Calendar information could not be cleared. Please try again." };
  }

  revalidatePath(`/${school}/admin/calendar`);
  revalidatePath(`/${school}/schedule`);
  revalidatePath(`/${school}/app/schedule`);
  return { status: "success", message: `Calendar information cleared for ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`, date };
}
