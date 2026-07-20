"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SchoolLogo from "@/components/SchoolLogo";
import ThemeToggle from "@/components/ThemeToggle";
import KioskMenuControls from "@/components/KioskMenuControls";
import type { AppearancePreference } from "@/lib/themeScope";

type Props = { school: string; schoolName: string; logoUrl: string | null; base: string; schoolDefaultAppearance?: AppearancePreference };

export default function SchoolPublicNav({ school, schoolName, logoUrl, base, schoolDefaultAppearance }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === `${base}/app` || pathname.startsWith(`${base}/app/`) || pathname === `${base}/admin` || pathname.startsWith(`${base}/admin/`) || pathname.startsWith(`/admin/${school}`)) return null;
  if (pathname === `${base}/kiosk` || pathname.startsWith(`${base}/kiosk/`)) return <nav className="school-menu-bar border-b border-slate-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-black"><div className="flex justify-end"><KioskMenuControls school={school} schoolDefaultAppearance={schoolDefaultAppearance} /></div></nav>;

  const items = [
    ["Home", base || "/"], ["Announcements", `${base}/announcements`], ["Events", `${base}/events`],
    ["Resources", `${base}/resources`], ["Calendar", `${base}/schedule`], ["App", `${base}/app`], ["Kiosk", `${base}/kiosk`],
  ];
  const active = (href: string) => pathname === href || (href !== (base || "/") && pathname.startsWith(`${href}/`));

  return <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 text-slate-950 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#141618]/90 dark:text-white">
    <div className="mx-auto flex min-h-20 max-w-[1360px] items-center gap-5 px-5 sm:px-8 lg:px-12">
      <Link href={base || "/"} className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)]"><SchoolLogo schoolName={schoolName} logoUrl={logoUrl} size="md" /><span className="max-w-[13rem] truncate text-sm font-black sm:max-w-[17rem]">{schoolName}</span></Link>
      <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 xl:flex">{items.map(([label, href]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`rounded-full px-3 py-2 text-sm font-bold transition ${active(href) ? "bg-[color-mix(in_srgb,var(--school-primary)_14%,transparent)] text-[var(--school-primary)]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}`}>{label}</Link>)}</nav>
      <ThemeToggle scope="site" schoolSlug={school} schoolDefaultAppearance={schoolDefaultAppearance} variant="icon" className="hidden sm:inline-flex" />
      <button type="button" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-slate-300 xl:hidden dark:border-white/20" aria-expanded={open} aria-controls="public-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}><span aria-hidden="true" className="text-xl">{open ? "×" : "☰"}</span></button>
    </div>
    {open && <nav id="public-mobile-menu" aria-label="Mobile" className="border-t border-slate-200 px-5 py-4 dark:border-white/10 xl:hidden"><div className="mx-auto grid max-w-[1360px] gap-1">{items.map(([label, href]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`flex min-h-11 items-center rounded-xl px-4 text-sm font-bold ${active(href) ? "bg-[var(--school-primary)] text-[var(--school-primary-text)]" : "hover:bg-slate-100 dark:hover:bg-white/10"}`}>{label}</Link>)}<div className="mt-3 border-t border-slate-200 pt-4 dark:border-white/10"><ThemeToggle scope="site" schoolSlug={school} schoolDefaultAppearance={schoolDefaultAppearance} variant="segmented" /></div></div></nav>}
  </header>;
}
