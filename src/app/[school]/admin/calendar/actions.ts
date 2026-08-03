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

export type DeleteCalendarWizardDraftResult = {
  status: "success" | "error";
  message: string;
  draftId?: string;
};

export async function deleteSavedCalendarProgressAction(
  school: string,
  input: { draftId: string; schoolYearLabel: string | null },
): Promise<DeleteCalendarWizardDraftResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.draftId,
    )
  ) {
    return {
      status: "error",
      message: "Saved calendar setup could not be deleted. Please try again.",
    };
  }

  const lookupClient = await createSupabaseServerClient();
  const { data: schoolData } = await lookupClient
    .rpc("get_available_school_by_subdomain", {
      subdomain_input: school,
    })
    .maybeSingle<{ id: string }>();
  if (!schoolData) notFound();

  const { supabase } = await requireAdminSectionAccess(
    schoolData.id,
    "calendar",
    school,
  );
  let deletion = supabase
    .from("calendar_wizard_drafts")
    .delete()
    .eq("id", input.draftId)
    .eq("school_id", schoolData.id);
  deletion = input.schoolYearLabel
    ? deletion.eq("school_year_label", input.schoolYearLabel)
    : deletion.is("school_year_label", null);

  const { data, error } = await deletion
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !data) {
    if (error)
      console.error(
        "Delete saved calendar progress error:",
        JSON.stringify(error, null, 2),
      );
    return {
      status: "error",
      message: "Saved calendar setup could not be deleted. Please try again.",
    };
  }

  revalidatePath(`/${school}/admin/calendar`);
  return {
    status: "success",
    message: "Saved calendar setup deleted.",
    draftId: data.id,
  };
}

export async function clearCalendarDayAction(
  school: string,
  date: string,
): Promise<ClearCalendarDayResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      status: "error",
      message: "Select a valid calendar date and try again.",
    };
  }

  const lookupClient = await createSupabaseServerClient();
  const { data: schoolData } = await lookupClient
    .rpc("get_available_school_by_subdomain", {
      subdomain_input: school,
    })
    .maybeSingle<{ id: string }>();
  if (!schoolData) notFound();

  const { supabase } = await requireAdminSectionAccess(
    schoolData.id,
    "calendar",
    school,
  );
  const { error } = await supabase
    .from("calendar_days")
    .delete()
    .eq("school_id", schoolData.id)
    .eq("date", date);

  if (error) {
    console.error("Clear calendar day error:", JSON.stringify(error, null, 2));
    return {
      status: "error",
      message: "Calendar information could not be cleared. Please try again.",
    };
  }

  revalidatePath(`/${school}/admin/calendar`);
  revalidatePath(`/${school}/schedule`);
  revalidatePath(`/${school}/app/schedule`);
  return {
    status: "success",
    message: `Calendar information cleared for ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`,
    date,
  };
}
