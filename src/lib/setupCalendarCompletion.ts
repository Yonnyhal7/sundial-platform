import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateSchoolSetupStep } from "@/lib/schools";

export type CompleteSetupCalendarStepResult =
  | { status: "success" }
  | { status: "validation_error"; message: string };

export async function hasPersistedInstructionalCalendarDays(
  supabase: SupabaseClient,
  schoolId: string
) {
  const { data, error } = await supabase
    .from("calendar_days")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_school_day", true)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Setup calendar verification error:", JSON.stringify(error, null, 2));
    return false;
  }

  return Boolean(data?.id);
}

export function revalidateSetupCalendarRoutes(school: string) {
  const paths = [
    `/${school}/admin`,
    `/${school}/admin/setup`,
    `/${school}/admin/setup/schedule`,
    `/${school}/admin/setup/complete`,
  ];

  for (const path of paths) {
    revalidatePath(path);
  }

  revalidatePath("/[school]/admin", "layout");
  revalidatePath("/[school]/admin/setup", "layout");
}

export async function completeSetupCalendarStep({
  supabase,
  schoolId,
  school,
}: {
  supabase: SupabaseClient;
  schoolId: string;
  school: string;
}): Promise<CompleteSetupCalendarStepResult> {
  const hasCalendarDays = await hasPersistedInstructionalCalendarDays(supabase, schoolId);

  if (!hasCalendarDays) {
    return {
      status: "validation_error",
      message:
        "Create your school-year calendar before continuing to Launch School.",
    };
  }

  await updateSchoolSetupStep(supabase, schoolId, "complete");
  revalidateSetupCalendarRoutes(school);

  return { status: "success" };
}
