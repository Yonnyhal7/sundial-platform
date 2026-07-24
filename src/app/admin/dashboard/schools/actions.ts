"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { generateSchoolSubdomainBase, generateUniqueSchoolSubdomain } from "@/lib/schools";
import {
  createSchoolSetupInvitationToken,
  getSchoolSetupInvitationExpiration,
  hashSchoolSetupInvitationToken,
} from "@/lib/invitations/tokens";
import { deliverSchoolSetupInvitation } from "@/lib/email/schoolSetupDelivery.server";

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

class SchoolInsertError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function insertSchoolWithPlatformDefaults({
  supabase,
  name,
  subdomain,
  districtId,
  createdAt,
}: {
  supabase: Awaited<ReturnType<typeof requireSuperAdminAccess>>["supabase"];
  name: string;
  subdomain: string;
  districtId: string | null;
  createdAt: string;
}) {
  const { data, error } = await supabase.rpc("create_school_with_platform_defaults", {
    p_name: name,
    p_slug: subdomain,
    p_subdomain: subdomain,
    p_district_id: districtId,
    p_created_at: createdAt,
  }).single<{ id: string; subdomain: string }>();
  if (error || !data) throw new SchoolInsertError(error?.message || "Could not create school.", error?.code);
  return data;
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
  const rawToken = createSchoolSetupInvitationToken();
  const tokenHash = hashSchoolSetupInvitationToken(rawToken);
  const expiresAt = getSchoolSetupInvitationExpiration();
  const { data, error } = await serviceSupabase
    .from("pending_admin_invites")
    .insert({
      school_id: schoolId,
      email,
      invite_token: tokenHash,
      expires_at: expiresAt.toISOString(),
      status: "pending",
      role: "school_admin",
      created_by: createdBy,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) throw new Error("Could not create the school setup invitation.");
  return { inviteId: data.id, rawToken, tokenHash, expiresAt };
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
    try {
      school = await insertSchoolWithPlatformDefaults({
        supabase,
        name,
        subdomain,
        districtId: profile.district_id || null,
        createdAt: now,
      });
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

  let inviteDelivery = "record_failed";
  let manualInviteToken: string | null = null;
  try {
    const invitation = await createPendingAdminInvite({
      schoolId: school.id,
      email: adminEmail,
      createdBy: profile.id,
    });
    manualInviteToken = invitation.rawToken;
    const delivery = await deliverSchoolSetupInvitation({
      supabase,
      inviteId: invitation.inviteId,
      schoolId: school.id,
      rawToken: invitation.rawToken,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
      rotateToken: false,
    });
    inviteDelivery = delivery.status;
    const audit = createSupabaseServiceRoleClient();
    await audit.from("platform_user_audit").insert([
      {
        actor_id: profile.id,
        school_id: school.id,
        invitation_id: invitation.inviteId,
        action:
          delivery.status === "sent"
            ? "invitation_delivery_succeeded"
            : "invitation_delivery_failed",
        summary:
          delivery.status === "sent"
            ? "Initial school invitation delivery succeeded"
            : "Initial school invitation delivery did not succeed",
        result_status: delivery.status === "sent" ? "success" : "blocked",
        new_values: {
          delivery_status: delivery.status,
          token_rotated: false,
          fallback_link_generated: Boolean(delivery.fallbackUrl),
        },
      },
      {
        actor_id: profile.id,
        school_id: school.id,
        invitation_id: invitation.inviteId,
        action: "invitation_fallback_generated",
        summary: "Generated initial school invitation fallback link",
        result_status: "success",
        new_values: {
          token_rotated: false,
          expires_at: invitation.expiresAt.toISOString(),
        },
      },
    ]);
  } catch {
    // The school is intentionally retained. The SuperAdmin can inspect and
    // retry invitation delivery without recreating tenant data.
  }

  // TODO: Provision custom/preview domain through the Vercel Domains API.
  // TODO: Create the school DNS record through the Cloudflare DNS API.

  revalidatePath("/admin/dashboard/schools");
  const invitationFragment = manualInviteToken
    ? `#setupToken=${encodeURIComponent(manualInviteToken)}`
    : "";
  redirect(
    `/admin/dashboard/schools?created=${encodeURIComponent(name)}&subdomain=${encodeURIComponent(
      school.subdomain
    )}&inviteDelivery=${encodeURIComponent(inviteDelivery)}${invitationFragment}`
  );
}
