"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAuthShell from "./AdminAuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/auth/passwordRecovery";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

export default function PasswordRecoveryForm({ returnTo, requestHref }: { returnTo: string; requestHref: string }) {
  const router = useRouter();
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false); const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(true); const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState(false);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) { setValid(true); setChecking(false); }
    });
    const timeout = window.setTimeout(() => setChecking(false), 2500);
    return () => { window.clearTimeout(timeout); data.subscription.unsubscribe(); };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!valid || loading) return;
    const validation = validateNewPassword(password, confirm); if (validation) { setError(validation); return; }
    setLoading(true); setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError("This reset link is invalid or has expired. Request a new link and try again."); setValid(false); setLoading(false); return; }
    setSuccess(true); await supabase.auth.signOut();
    window.setTimeout(() => router.replace(`${returnTo}${returnTo.includes("?") ? "&" : "?"}passwordUpdated=1`), 1200);
  }
  if (checking) return <AdminAuthShell><h1 className="mt-8 text-3xl font-bold">Checking reset link…</h1><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Securely establishing your password-recovery session.</p></AdminAuthShell>;
  if (!valid && !success) return <AdminAuthShell><h1 className="mt-8 text-3xl font-bold">Reset link unavailable</h1><p role="alert" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">This reset link is missing, malformed, expired, or has already been used.</p><Link href={requestHref} className={sundialPrimaryButtonClass("mt-8 block w-full py-3.5 text-center")}>Request Another Link</Link></AdminAuthShell>;
  return <AdminAuthShell><h1 className="mt-8 text-3xl font-bold">Choose a New Password</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.</p>{success ? <p role="status" className="mt-8 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Password updated successfully. Returning to sign in…</p> : <form onSubmit={submit} className="mt-8 space-y-5">{[["new-password","New password",password,setPassword],["confirm-password","Confirm new password",confirm,setConfirm]].map(([id,label,value,setter]) => <div key={id as string}><label htmlFor={id as string} className="text-sm font-semibold">{label as string}</label><div className="relative"><input id={id as string} type={show ? "text" : "password"} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required value={value as string} onChange={(e) => (setter as (v:string)=>void)(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-16 outline-none focus:border-[#D4A017] dark:border-white/10 dark:bg-[#0b1220]" /></div></div>)}<button type="button" onClick={() => setShow(!show)} className="text-sm font-semibold text-[#9A7209] dark:text-[#F6C64A]">{show ? "Hide passwords" : "Show passwords"}</button>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">{error}</p>}<button disabled={loading} className={sundialPrimaryButtonClass("w-full py-3.5")}>{loading ? "Updating…" : "Update Password"}</button></form>}</AdminAuthShell>;
}
