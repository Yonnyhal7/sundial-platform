"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSchoolSetupPath } from "@/lib/auth/adminPermissions";
import {
  acceptSchoolSetupInvitation,
} from "@/lib/invitations/acceptance.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SCHOOL_SETUP_ACCEPTANCE_COOKIE } from "@/lib/invitations/constants";

export type AcceptInvitationState = { error?: string };

export async function acceptInvitationAction(
  _previousState: AcceptInvitationState,
  formData: FormData
): Promise<AcceptInvitationState> {
  const firstName = String(formData.get("firstName") || "").trim().replace(/\s+/g, " ");
  const lastName = String(formData.get("lastName") || "").trim().replace(/\s+/g, " ");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!firstName || !lastName) return { error: "Enter your first and last name." };
  if (firstName.length > 100 || lastName.length > 100) {
    return { error: "Names must be 100 characters or fewer." };
  }
  if (password.length < 12) return { error: "Use a password with at least 12 characters." };
  if (password.length > 128) return { error: "Password must be 128 characters or fewer." };
  if (password !== confirmPassword) return { error: "The passwords do not match." };

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SCHOOL_SETUP_ACCEPTANCE_COOKIE)?.value ?? "";
  const result = await acceptSchoolSetupInvitation({
    sessionToken,
    firstName,
    lastName,
    password,
  });
  if (!result.ok) {
    if (result.reason === "expired") return { error: "This invitation has expired." };
    if (result.reason === "already_used") return { error: "This invitation has already been used." };
    if (result.reason === "temporarily_locked") {
      return { error: "This invitation is already being accepted. Please wait and try again." };
    }
    if (result.reason === "account_exists") {
      return {
        error:
          "An account already exists for this email. The invitation was not accepted or attached. Contact Sundial support.",
      };
    }
    if (result.reason === "account_error") {
      return { error: "The administrator account could not be created. Contact Sundial support." };
    }
    return { error: "This invitation is not valid." };
  }

  const sessionSupabase = await createSupabaseServerClient();
  const { error: signInError } = await sessionSupabase.auth.signInWithPassword({
    email: result.email,
    password,
  });
  cookieStore.delete(SCHOOL_SETUP_ACCEPTANCE_COOKIE);
  if (signInError) {
    return {
      error:
        "Your account was created, but automatic sign-in failed. Use the school sign-in page with the password you chose.",
    };
  }

  redirect(await getSchoolSetupPath(result.schoolSubdomain));
}
