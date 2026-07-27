import Link from "next/link";
import SchoolAppInstallLink from "@/components/pwa/SchoolAppInstallLink";
import SchoolLogo from "@/components/SchoolLogo";
import { publicDensity } from "@/components/public-site/publicDensity";

export function PublicContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${publicDensity.container} ${className}`}>{children}</div>;
}

export function PublicPageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return <header className="border-b border-slate-200/80 bg-white/70 py-9 dark:border-white/10 dark:bg-[#151719] sm:py-11"><PublicContainer>
    {eyebrow && <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--school-primary)] sm:text-sm">{eyebrow}</p>}
    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">{title}</h1>
    <p className="mt-3 max-w-2xl text-base leading-6 text-slate-600 dark:text-slate-300">{description}</p>
  </PublicContainer></header>;
}

export function SectionHeading({ title, eyebrow, href, linkLabel }: { title: string; eyebrow?: string; href?: string; linkLabel?: string }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div>{eyebrow && <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--school-primary)]">{eyebrow}</p>}<h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">{title}</h2></div>{href && <Link href={href} className={`${publicDensity.touchTarget} inline-flex shrink-0 items-center text-sm font-bold text-[var(--school-primary)] underline-offset-4 hover:underline`}>{linkLabel || "View all"} <span aria-hidden="true">→</span></Link>}</div>;
}

export function PublicEmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-white/[.06] dark:text-slate-300">{children}</p>;
}

export function PublicSiteFooter({ school, base }: { school: { name: string; logo_url: string | null; district_name: string | null; address: string | null; phone_number: string | null; main_office: string | null }; base: string }) {
  return <footer className="border-t border-slate-200 bg-[#151719] py-9 text-slate-300 dark:border-white/10"><PublicContainer className="grid gap-7 md:grid-cols-[1.6fr_1fr]">
    <div className="flex gap-3"><SchoolLogo schoolName={school.name} logoUrl={school.logo_url} variant="websiteHeader" allowArtworkOverflow className="h-[3.75rem] w-[3.75rem] p-1" /><div><p className="font-black text-white">{school.name}</p>{school.district_name && <p className="mt-1 text-sm">{school.district_name}</p>}{school.address && <p className="mt-3 whitespace-pre-line text-sm leading-5">{school.address}</p>}{school.phone_number && <a className={`${publicDensity.touchTarget} inline-flex items-center text-sm hover:text-white`} href={`tel:${school.phone_number}`}>Main office: {school.phone_number}</a>}{!school.address && !school.phone_number && <p className="mt-2 text-sm text-slate-400">Contact information has not been published yet.</p>}</div></div>
    <div><p className="font-bold text-white">Explore</p><nav aria-label="Footer" className="mt-2 grid text-sm"><Link className={`${publicDensity.touchTarget} inline-flex items-center`} href={`${base}/announcements`}>Announcements</Link><Link className={`${publicDensity.touchTarget} inline-flex items-center`} href={`${base}/events`}>Events</Link><Link className={`${publicDensity.touchTarget} inline-flex items-center`} href={`${base}/resources`}>Resources</Link><Link className={`${publicDensity.touchTarget} inline-flex items-center`} href={`${base}/schedule`}>Calendar</Link><SchoolAppInstallLink className={`${publicDensity.touchTarget} inline-flex items-center`} href={`${base}/app`}>School App</SchoolAppInstallLink></nav><p className="mt-4 text-xs text-slate-500">Powered by Sundial</p></div>
  </PublicContainer></footer>;
}
