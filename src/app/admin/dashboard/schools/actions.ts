"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { generateSchoolSubdomainBase, generateUniqueSchoolSubdomain } from "@/lib/schools";

export type CreateSchoolState = {
  error?: string;
};

function normalizeSchoolName(formData: FormData) {
  return String(formData.get("name") || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(formData: FormData) {
  return String(formData.get("adminEmail") || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createInviteToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

class SchoolInsertError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function insertSchoolWithSetupIncomplete({
  supabase,
  payload,
}: {
  supabase: Awaited<ReturnType<typeof requireSuperAdminAccess>>["supabase"];
  payload: Record<string, string | boolean>;
}) {
  const { data, error } = await supabase
    .from("schools")
    .insert({ ...payload, setup_complete: false, setup_step: "welcome" })
    .select("id, subdomain")
    .single<{ id: string; subdomain: string }>();

  if (!error && data) {
    return data;
  }

  if (error?.code === "23505") {
    throw new SchoolInsertError(error.message, error.code);
  }

  const { data: setupCompleteFallbackData, error: setupCompleteFallbackError } = await supabase
    .from("schools")
    .insert({ ...payload, setup_complete: false })
    .select("id, subdomain")
    .single<{ id: string; subdomain: string }>();

  if (!setupCompleteFallbackError && setupCompleteFallbackData) {
    return setupCompleteFallbackData;
  }

  if (setupCompleteFallbackError?.code === "23505") {
    throw new SchoolInsertError(setupCompleteFallbackError.message, setupCompleteFallbackError.code);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("schools")
    .insert(payload)
    .select("id, subdomain")
    .single<{ id: string; subdomain: string }>();

  if (fallbackError || !fallbackData) {
    throw new SchoolInsertError(
      fallbackError?.message ||
        setupCompleteFallbackError?.message ||
        error?.message ||
        "Could not create school.",
      fallbackError?.code
    );
  }

  return fallbackData;
}

async function createPendingAdminInvite({
  schoolId,
  email,
  createdBy,
}: {
  schoolId: string;
  email: string;
  createdBy: string;
}) {
  const serviceSupabase = createSupabaseServiceRoleClient();
  const { error } = await serviceSupabase.from("pending_admin_invites").insert({
    school_id: schoolId,
    email,
    invite_token: createInviteToken(),
    status: "pending",
    created_by: createdBy,
  });

  if (error) {
    console.error("Pending admin invite error:", JSON.stringify(error, null, 2));
  }

  // TODO: Email the temporary login/invite link to the school admin.
}

export async function createSchoolAction(
  _previousState: CreateSchoolState,
  formData: FormData
): Promise<CreateSchoolState> {
  const { supabase, profile } = await requireSuperAdminAccess();
  const name = normalizeSchoolName(formData);
  const adminEmail = normalizeEmail(formData);

  if (!name) {
    return { error: "Enter a school name." };
  }

  if (!isValidEmail(adminEmail)) {
    return { error: "Enter a valid temporary school admin email." };
  }

  if (!generateSchoolSubdomainBase(name)) {
    return { error: "Enter a school name with at least one letter or number." };
  }

  const now = new Date().toISOString();
  const MAX_SUBDOMAIN_ATTEMPTS = 5;

  let school: { id: string; subdomain: string } | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_SUBDOMAIN_ATTEMPTS; attempt++) {
    const subdomain = await generateUniqueSchoolSubdomain(supabase, name);
    const payload = {
      name,
      slug: subdomain,
      subdomain,
      mascot: "",
      primary_color: "#2563eb",
      secondary_color: "#64748b",
      timezone: "America/Los_Angeles",
      is_active: false,
      ...(profile.district_id ? { district_id: profile.district_id } : {}),
      created_at: now,
    };

    try {
      school = await insertSchoolWithSetupIncomplete({ supabase, payload });
      break;
    } catch (error) {
      lastError = error;

      // Another request just took this subdomain between our availability
      // check and this insert — regenerate and retry instead of failing.
      if (error instanceof SchoolInsertError && error.code === "23505") {
        continue;
      }

      return {
        error: error instanceof Error ? error.message : "Could not create school.",
      };
    }
  }

  if (!school) {
    return {
      error:
        lastError instanceof Error
          ? lastError.message
          : "Could not create school. Please try again.",
    };
  }

  await createPendingAdminInvite({
    schoolId: school.id,
    email: adminEmail,
    createdBy: profile.id,
  });

  // TODO: Provision custom/preview domain through the Vercel Domains API.
  // TODO: Create the school DNS record through the Cloudflare DNS API.

  revalidatePath("/admin/dashboard/schools");
  redirect(
    `/admin/dashboard/schools?created=${encodeURIComponent(name)}&subdomain=${encodeURIComponent(
      school.subdomain
    )}`
  );
}
