"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { applyTheme, getPreferredAppearance, resolveAppearanceTheme } from "@/lib/themeScope";

export default function AdminAuthShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const preference = getPreferredAppearance("admin");
      applyTheme(resolveAppearanceTheme(preference), "admin", preference);
    };
    apply();
    const timeout = window.setTimeout(() => setReady(true), 0);
    const change = () => apply();
    media.addEventListener("change", change);
    return () => { window.clearTimeout(timeout); media.removeEventListener("change", change); };
  }, []);
  return (
    <main className={`fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-auto bg-slate-100 px-4 py-16 text-slate-950 transition-opacity dark:bg-[#0b1120] dark:text-white ${ready ? "opacity-100" : "opacity-0"}`}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,160,23,0.12),_transparent_34rem)] dark:bg-[radial-gradient(circle_at_top,_rgba(212,160,23,0.16),_transparent_36rem)]" />
      <div className="fixed right-4 top-4 z-20"><ThemeToggle scope="admin" variant="segmented" fixedAdminColors /></div>
      <section className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#111827] sm:p-8">
        <div className="flex items-center gap-3"><Image src="/sundial-icon.png" alt="" width={44} height={48} className="h-11 w-11 object-contain" priority /><div><p className="text-sm font-black uppercase tracking-[0.24em] text-[#9A7209] dark:text-[#F6C64A]">Sundial</p><p className="text-lg font-bold">Sundial Admin</p></div></div>
        {children}
      </section>
    </main>
  );
}
