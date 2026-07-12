import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { SetupStepSlug } from "@/lib/setupSteps";

export type SchoolSetupStatus = "active" | "incomplete";

export type SuperAdminSchoolSummary = {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean | null;
  created_at: string | null;
};

const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "select-school",
  "support",
  "www",
]);

const SCHOOL_SUFFIX_WORDS = new Set([
  "school",
  "schools",
  "high",
  "middle",
  "elementary",
  "junior",
  "senior",
]);

export type SchoolStatusColumns = {
  is_active: boolean | null;
  setup_complete?: boolean | null;
};

export function getSchoolSetupStatus(school: SchoolStatusColumns): SchoolSetupStatus {
  if (typeof school.setup_complete === "boolean") {
    return school.setup_complete ? "active" : "incomplete";
  }

  return school.is_active ? "active" : "incomplete";
}

export function getSchoolSetupStatusLabel(status: SchoolSetupStatus) {
  return status === "active" ? "Active" : "Setup Incomplete";
}

export function generateSchoolSubdomainBase(name: string) {
  const words = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !SCHOOL_SUFFIX_WORDS.has(word));

  const slug = words.join("-");

  if (!slug || RESERVED_SUBDOMAINS.has(slug)) {
    return "school";
  }

  return slug;
}

export async function generateUniqueSchoolSubdomain(
  supabase: SupabaseClient,
  schoolName: string
) {
  const baseSubdomain = generateSchoolSubdomainBase(schoolName);
  let candidate = baseSubdomain;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("schools")
      .select("id")
      .eq("subdomain", candidate)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return candidate;
    }

    candidate = `${baseSubdomain}-${suffix}`;
    suffix += 1;
  }
}

export async function isSchoolSetupComplete(
  supabase: SupabaseClient,
  schoolId: string
) {
  const { data, error } = await supabase
    .from("schools")
    .select("setup_complete, is_active")
    .eq("id", schoolId)
    .maybeSingle<SchoolStatusColumns>();

  if (!error && data) {
    return getSchoolSetupStatus(data) === "active";
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("schools")
    .select("is_active")
    .eq("id", schoolId)
    .maybeSingle<SchoolStatusColumns>();

  if (fallbackError || !fallbackData) {
    return false;
  }

  return getSchoolSetupStatus(fallbackData) === "active";
}

export async function updateSchoolSetupComplete(
  supabase: SupabaseClient,
  schoolId: string,
  complete: boolean
) {
  const completePayload = {
    setup_complete: complete,
    is_active: complete,
    setup_step: complete ? "complete" : "welcome",
  };
  const { error } = await supabase
    .from("schools")
    .update(completePayload)
    .eq("id", schoolId);

  if (!error) {
    return;
  }

  const { error: setupCompleteFallbackError } = await supabase
    .from("schools")
    .update({ setup_complete: complete, is_active: complete })
    .eq("id", schoolId);

  if (!setupCompleteFallbackError) {
    return;
  }

  const { error: fallbackError } = await supabase
    .from("schools")
    .update({ is_active: complete })
    .eq("id", schoolId);

  if (fallbackError) {
    throw new Error(
      fallbackError.message || setupCompleteFallbackError.message || error.message
    );
  }
}

export async function updateSchoolSetupStep(
  supabase: SupabaseClient,
  schoolId: string,
  step: SetupStepSlug
) {
  const { error } = await supabase
    .from("schools")
    .update({ setup_step: step })
    .eq("id", schoolId);

  if (error) {
    throw new Error(error.message);
  }
}

export type SetupSchool = {
  id: string;
  name: string;
  subdomain: string;
  mascot: string | null;
  logo_url?: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  timezone: string | null;
  district_id: string | null;
  is_active: boolean | null;
  setup_complete?: boolean | null;
  setup_step?: SetupStepSlug | null;
};

export async function getSchoolForSetup(subdomain: string) {
  const serviceSupabase = createSupabaseServiceRoleClient();
  const normalizedSubdomain = subdomain.trim().toLowerCase();

  const setupSelect =
    "id, name, subdomain, mascot, logo_url, primary_color, secondary_color, timezone, district_id, is_active, setup_complete, setup_step";

  const { data, error } = await serviceSupabase
    .from("schools")
    .select(setupSelect)
    .eq("subdomain", normalizedSubdomain)
    .maybeSingle<SetupSchool>();

  if (!error && data) {
    return data;
  }

  const { data: rpcSchool } = await serviceSupabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: normalizedSubdomain,
    })
    .maybeSingle<SetupSchool>();

  if (rpcSchool) {
    return rpcSchool;
  }

  const { data: fallbackData } = await serviceSupabase
    .from("schools")
    .select(
      "id, name, subdomain, mascot, logo_url, primary_color, secondary_color, timezone, district_id, is_active"
    )
    .eq("subdomain", normalizedSubdomain)
    .maybeSingle<SetupSchool>();

  return fallbackData || null;
}
