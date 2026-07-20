import ForgotPasswordForm from "@/components/admin/ForgotPasswordForm";
import { getPasswordRecoveryRedirectUrl } from "@/lib/auth/passwordRecovery.server";
import { connection } from "next/server";

export default async function SuperAdminForgotPasswordPage() {
  await connection();
  return <ForgotPasswordForm signInHref="/admin" redirectTo={getPasswordRecoveryRedirectUrl("/admin")} />;
}
