"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminLoginShell from "@/components/admin/AdminLoginShell";
import { getAdminUtilityPath } from "@/lib/routing/paths";

export default function AdminLoginForm({ passwordUpdated = false }: { passwordUpdated?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(
      getAdminUtilityPath(
        window.location.pathname,
        window.location.hostname.toLowerCase(),
        "/dashboard"
      )
    );
    router.refresh();
  }

  return (
    <AdminLoginShell
      email={email}
      password={password}
      error={error}
      loading={loading}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleLogin}
      forgotPasswordHref="/admin/forgot-password"
      success={passwordUpdated ? "Your password was updated successfully. Sign in with your new password." : null}
    />
  );
}
