"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import AdminAuthShell from "./AdminAuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PASSWORD_RESET_CONFIRMATION, PASSWORD_RESET_COOLDOWN_SECONDS, validateRecoveryEmail } from "@/lib/auth/passwordRecovery";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

export default function ForgotPasswordForm({ signInHref, redirectTo }: { signInHref: string; redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const submitting = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || cooldown > 0) return;
    if (!validateRecoveryEmail(email)) { setError("Enter a valid email address."); return; }
    submitting.current = true; setLoading(true); setError(null);
    try {
      await createSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      setSent(true); setCooldown(PASSWORD_RESET_COOLDOWN_SECONDS);
      const timer = window.setInterval(() => setCooldown((value) => { if (value <= 1) { window.clearInterval(timer); return 0; } return value - 1; }), 1000);
    } catch { setSent(true); setCooldown(PASSWORD_RESET_COOLDOWN_SECONDS); }
    finally { submitting.current = false; setLoading(false); }
  }
  return <AdminAuthShell><h1 className="mt-8 text-3xl font-bold">Forgot password?</h1><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Enter your administrator email and we’ll send secure reset instructions.</p><form onSubmit={submit} className="mt-8 space-y-5"><div><label htmlFor="recovery-email" className="text-sm font-semibold">Email</label><input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#D4A017] focus:ring-2 focus:ring-[#D4A017]/25 dark:border-white/10 dark:bg-[#0b1220]" /></div>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">{error}</p>}{sent && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">{PASSWORD_RESET_CONFIRMATION}</p>}<button className={sundialPrimaryButtonClass("w-full py-3.5")} disabled={loading || cooldown > 0}>{loading ? "Sending..." : cooldown > 0 ? `Send again in ${cooldown}s` : "Send Reset Link"}</button><Link href={signInHref} className="block text-center text-sm font-semibold text-[#9A7209] hover:underline dark:text-[#F6C64A]">Back to Sign In</Link></form></AdminAuthShell>;
}
