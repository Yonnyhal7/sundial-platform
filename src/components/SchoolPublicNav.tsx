"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ComponentType } from "react";
import SchoolLogo from "@/components/SchoolLogo";
import KioskMenuControls from "@/components/KioskMenuControls";
import SchoolAppInstallLink from "@/components/pwa/SchoolAppInstallLink";
import { DashboardIcon, EventIcon, MegaphoneIcon, ResourcesIcon, UserIcon } from "@/components/admin/AdminNavIcons";
import { CalendarIcon, HomeIcon, MenuIcon } from "@/components/mobile-app/AppIcons";
import { applyTheme, getPreferredAppearance, resolveAppearanceTheme, setStoredAppearancePreference, type AppearancePreference } from "@/lib/themeScope";

type Props = { school: string; schoolName: string; logoUrl: string | null; base: string; schoolDefaultAppearance?: AppearancePreference };
type NavItem = { label: string; desktopLabel?: string; href: string; icon: ComponentType<{ className?: string }>; installSurface?: boolean };

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function AppearanceIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36 6.36-1.42-1.42M7.06 7.06 5.64 5.64m12.72 0-1.42 1.42M7.06 16.94l-1.42 1.42" /><circle cx="12" cy="12" r="4" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>;
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
}

export default function SchoolPublicNav({ school, schoolName, logoUrl, base, schoolDefaultAppearance }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreference>("system");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceSheetRef = useRef<HTMLDivElement>(null);
  const homeHref = base || "/";
  const items: NavItem[] = [
    { label: "Home", href: homeHref, icon: HomeIcon },
    { label: "Announcements", href: `${base}/announcements`, icon: MegaphoneIcon },
    { label: "Events", href: `${base}/events`, icon: EventIcon },
    { label: "Resources", href: `${base}/resources`, icon: ResourcesIcon },
    { label: "Calendar", href: `${base}/schedule`, icon: CalendarIcon },
    { label: "School App", desktopLabel: "App", href: `${base}/app`, icon: UserIcon, installSurface: true },
    { label: "Kiosk", href: `${base}/kiosk`, icon: DashboardIcon },
  ];
  const active = (href: string) => pathname === href || (href !== homeHref && pathname.startsWith(`${href}/`));

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const activePanel = appearanceOpen ? appearanceSheetRef.current : menuPanelRef.current;
      focusableElements(activePanel)[0]?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (appearanceOpen) {
          setAppearanceOpen(false);
          window.setTimeout(() => appearanceButtonRef.current?.focus(), 0);
        } else {
          setOpen(false);
          window.setTimeout(() => menuButtonRef.current?.focus(), 0);
        }
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(appearanceOpen ? appearanceSheetRef.current : menuPanelRef.current);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appearanceOpen, open]);

  function closeMenu() {
    setAppearanceOpen(false);
    setOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }

  function showAppearance() {
    setAppearance(getPreferredAppearance("site", schoolDefaultAppearance, school));
    setAppearanceOpen(true);
    window.setTimeout(() => focusableElements(appearanceSheetRef.current)[0]?.focus(), 0);
  }

  function closeAppearance() {
    setAppearanceOpen(false);
    window.setTimeout(() => appearanceButtonRef.current?.focus(), 0);
  }

  function chooseAppearance(nextAppearance: AppearancePreference) {
    setAppearance(nextAppearance);
    setStoredAppearancePreference("site", nextAppearance, school);
    applyTheme(resolveAppearanceTheme(nextAppearance), "site", nextAppearance);
  }

  if (pathname === `${base}/app` || pathname.startsWith(`${base}/app/`) || pathname === `${base}/admin` || pathname.startsWith(`${base}/admin/`) || pathname.startsWith(`/admin/${school}`)) return null;
  if (pathname === `${base}/kiosk` || pathname.startsWith(`${base}/kiosk/`)) return <nav className="school-menu-bar border-b border-slate-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-black"><div className="flex justify-end"><KioskMenuControls school={school} schoolDefaultAppearance={schoolDefaultAppearance} /></div></nav>;

  return <><header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 text-slate-950 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#141618]/90 dark:text-white">
    <div className="mx-auto flex min-h-20 max-w-[1360px] items-center gap-5 px-5 sm:px-8 lg:px-12">
      <Link href={homeHref} className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)]"><SchoolLogo schoolName={schoolName} logoUrl={logoUrl} variant="websiteHeader" allowArtworkOverflow className="h-[3.15rem] w-[3.15rem] p-1" /><span className="max-w-[13rem] truncate text-sm font-black sm:max-w-[17rem]">{schoolName}</span></Link>
      <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 xl:flex">{items.map(({ label, desktopLabel, href, installSurface }) => {
        const className = `rounded-full px-3 py-2 text-sm font-bold transition ${active(href) ? "bg-[color-mix(in_srgb,var(--school-primary)_14%,transparent)] text-[var(--school-primary)]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}`;
        return installSurface
          ? <SchoolAppInstallLink key={href} href={href} aria-current={active(href) ? "page" : undefined} className={className}>{desktopLabel || label}</SchoolAppInstallLink>
          : <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={className}>{desktopLabel || label}</Link>;
      })}</nav>
      <button ref={menuButtonRef} type="button" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-slate-300 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] xl:hidden dark:border-white/20 dark:hover:bg-white/10" aria-expanded={open} aria-controls="public-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => open ? closeMenu() : setOpen(true)}>{open ? <CloseIcon /> : <MenuIcon className="h-6 w-6" />}</button>
    </div>

  </header>

    {open && createPortal(<div className="fixed inset-x-0 bottom-0 top-20 z-40 text-slate-950 xl:hidden dark:text-white" role="dialog" aria-modal="true" aria-label="Site navigation">
      <button type="button" aria-label="Close navigation" className="public-mobile-menu-backdrop absolute inset-0 cursor-default bg-slate-950/25 backdrop-blur-[2px] dark:bg-black/45" onClick={closeMenu} />
      <div ref={menuPanelRef} id="public-mobile-menu" className="public-mobile-menu-panel relative max-h-full overflow-y-auto border-b border-slate-200 bg-white/95 px-5 pb-5 pt-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#17191b]/95">
        <div className="mx-auto max-w-[1360px]">
          <div className="mb-3 flex items-center gap-3 px-2"><SchoolLogo schoolName={schoolName} logoUrl={logoUrl} variant="websiteHeader" allowArtworkOverflow className="h-14 w-14 p-1" /><span className="min-w-0 truncate text-sm font-black">{schoolName}</span></div>
          <nav aria-label="Mobile" className="grid gap-1">{items.map(({ label, href, icon: Icon, installSurface }) => {
            const className = `flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] ${active(href) ? "bg-[color-mix(in_srgb,var(--school-primary)_14%,transparent)] text-[var(--school-primary)]" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"}`;
            const content = <><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200"><Icon className="h-5 w-5" /></span>{label}</>;
            return installSurface
              ? <SchoolAppInstallLink key={href} href={href} onClick={closeMenu} aria-current={active(href) ? "page" : undefined} className={className}>{content}</SchoolAppInstallLink>
              : <Link key={href} href={href} onClick={closeMenu} aria-current={active(href) ? "page" : undefined} className={className}>{content}</Link>;
          })}</nav>
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10"><button ref={appearanceButtonRef} type="button" aria-haspopup="dialog" aria-expanded={appearanceOpen} onClick={showAppearance} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:text-slate-200 dark:hover:bg-white/10"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200"><AppearanceIcon className="h-5 w-5" /></span><span className="flex-1">Appearance</span><span aria-hidden="true" className="text-lg text-slate-400">›</span></button></div>
          <p className="mt-3 border-t border-slate-200 pt-4 text-center text-xs font-semibold text-slate-400 dark:border-white/10 dark:text-slate-500">Powered by Sundial</p>
        </div>
      </div>

      {appearanceOpen && <div className="absolute inset-0 z-10 flex items-end" role="presentation">
        <button type="button" aria-label="Close appearance settings" className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]" onClick={closeAppearance} />
        <div ref={appearanceSheetRef} role="dialog" aria-modal="true" aria-labelledby="appearance-title" className="public-appearance-sheet relative w-full rounded-t-[2rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl dark:bg-[#202224]">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" /><h2 id="appearance-title" className="text-lg font-black">Appearance</h2>
          <div className="mt-4 grid gap-1" role="radiogroup" aria-label="Website appearance">{appearanceOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={appearance === option.value} onClick={() => chooseAppearance(option.value)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:hover:bg-white/10"><span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border-2 ${appearance === option.value ? "border-[var(--school-primary)]" : "border-slate-300 dark:border-white/30"}`}>{appearance === option.value && <span className="h-2.5 w-2.5 rounded-full bg-[var(--school-primary)]" />}</span>{option.label}</button>)}</div>
          <button type="button" onClick={closeAppearance} className="mt-3 min-h-12 w-full rounded-2xl bg-slate-100 text-sm font-black hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:bg-white/10 dark:hover:bg-white/15">Done</button>
        </div>
      </div>}
    </div>, document.body)}
  </>;
}
