import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  ClockIcon,
  HomeIcon,
  LinkIcon,
  TrophyIcon,
} from "@/components/mobile-app/AppIcons";
import { getSundialFaviconMetadata } from "@/lib/tenantFavicon";

const DEMO_WEBSITE = "https://davids.sundialk12.com";
const DEMO_APP = "https://davids.sundialk12.com/app";
const DEMO_KIOSK = "https://davids.sundialk12.com/kiosk";
const CONTACT_HREF =
  "mailto:support@mrhcodes.com?subject=Sundial%20walkthrough%20request";

export const metadata: Metadata = {
  ...getSundialFaviconMetadata(),
  title: "Sundial | One school day, connected",
  description:
    "Sundial gives students, parents, and staff one place to see school calendars, events, athletics, announcements, bell schedules, and resources.",
};

const surface =
  "rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgb(15_23_42/0.08)]";
const primaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#3a1d0b] px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#542b10] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d99b16]/30";
const secondaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:border-[#b87900] hover:bg-[#fff9eb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d99b16]/25";

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SundialBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/sundial-launch-mark.webp"
        alt=""
        width={56}
        height={56}
        priority
        className={compact ? "h-9 w-9 object-contain" : "h-11 w-11 object-contain"}
      />
      <span className={compact ? "text-lg font-black tracking-[-.03em]" : "text-2xl font-black tracking-[-.04em]"}>
        Sundial
      </span>
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-black uppercase tracking-[.2em] text-[#9a6500]">
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  centered?: boolean;
}) {
  return (
    <header className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-[-.045em] text-slate-950 sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{body}</p>
    </header>
  );
}

function PhonePreview() {
  return (
    <div className="relative mx-auto w-[17.5rem] rounded-[2.8rem] border-[7px] border-[#251309] bg-slate-50 p-3 shadow-[0_30px_80px_rgb(58_29_11/0.24)] sm:w-[19rem]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#251309]" />
      <div className="flex items-center justify-between px-1">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#b88e31] text-[#211507]">
          <span className="h-4 w-4 border-y-2 border-current" />
        </span>
        <Image src="/sundial-launch-mark.webp" alt="Sundial" width={38} height={38} className="h-9 w-9 object-contain" />
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#b88e31] text-[#211507]">
          <BellIcon className="h-5 w-5" />
        </span>
      </div>
      <div className="pb-2 pt-7 text-center">
        <p className="text-sm font-bold text-[#a77b22]">Good morning,</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">David&apos;s School</p>
        <p className="mt-3 text-sm font-black text-slate-500">Friday, August 7</p>
        <div className="mx-auto mt-4 h-px w-12 bg-[#6d0e13]" />
      </div>
      <div className="mt-3 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-5 text-center shadow-sm">
        <p className="text-[.65rem] font-black uppercase tracking-[.18em] text-[#650b10]">Current period</p>
        <p className="mt-3 text-xl font-black text-slate-950">Period 2</p>
        <p className="mt-1 text-sm font-bold text-slate-500">10:00 AM – 11:00 AM</p>
        <div className="mx-auto mt-5 grid h-28 w-28 place-items-center rounded-full border-[10px] border-[#650b10]">
          <div>
            <p className="text-[.6rem] font-black uppercase tracking-wider text-slate-500">Time remaining</p>
            <p className="mt-1 text-2xl font-black text-slate-950">42:18</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 border-t border-slate-200 pt-4 text-left">
          <div className="border-r border-slate-200 pr-3">
            <p className="text-[.58rem] font-black uppercase tracking-wider text-slate-500">Next period</p>
            <p className="mt-1 text-xs font-black">Period 3</p>
          </div>
          <div className="pl-3">
            <p className="text-[.58rem] font-black uppercase tracking-wider text-slate-500">Day type</p>
            <p className="mt-1 text-xs font-black">Regular day</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 rounded-2xl bg-white p-2 text-slate-500 shadow-sm">
        {[HomeIcon, ClockIcon, CalendarIcon, TrophyIcon].map((Icon, index) => (
          <span key={index} className={index === 0 ? "grid h-10 place-items-center rounded-xl bg-[#f5f0e6] text-[#b88e31]" : "grid h-10 place-items-center"}>
            <Icon className="h-5 w-5" />
          </span>
        ))}
      </div>
    </div>
  );
}

function WebsitePreview() {
  return (
    <div className={`${surface} overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-2 rounded-full bg-white px-3 py-1 text-[.65rem] font-bold text-slate-500">davids.sundialk12.com</span>
      </div>
      <div className="relative overflow-hidden bg-slate-950 px-5 py-7 text-white sm:px-8 sm:py-9">
        <div aria-hidden="true" className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#8b161b]/70 blur-3xl" />
        <p className="relative text-[.6rem] font-black uppercase tracking-[.18em] text-white/65">Friday, August 7</p>
        <p className="relative mt-2 text-3xl font-black tracking-[-.05em]">David&apos;s School</p>
        <p className="relative mt-2 text-xs text-white/70">Everything happening at school, in one place.</p>
        <div className="relative mt-4 flex gap-2">
          <span className="rounded-full bg-white px-3 py-2 text-[.62rem] font-black text-slate-950">View Calendar</span>
          <span className="rounded-full border border-white/25 px-3 py-2 text-[.62rem] font-black">Open School App</span>
        </div>
      </div>
      <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2 sm:p-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
          <p className="text-[.58rem] font-black uppercase tracking-[.16em] text-[#7d1116]">Today at school</p>
          <p className="mt-1 text-sm font-black">Regular instructional day</p>
          <p className="mt-1 text-[.7rem] text-slate-500">Period 2 is in session</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[.58rem] font-black uppercase tracking-[.16em] text-[#7d1116]">Latest</p>
          <p className="mt-1 text-sm font-black">Announcements</p>
          <span className="mt-3 block h-1.5 w-4/5 rounded bg-slate-100" />
          <span className="mt-2 block h-1.5 w-3/5 rounded bg-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[.58rem] font-black uppercase tracking-[.16em] text-[#7d1116]">Save the date</p>
          <p className="mt-1 text-sm font-black">Upcoming events</p>
          <div className="mt-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#7d1116] text-[.55rem] font-black text-white">AUG<br />07</span><span className="text-[.7rem] font-bold">School calendar</span></div>
        </div>
      </div>
    </div>
  );
}

function KioskPreview() {
  const periods = [
    ["Period 1", "8:00 – 8:50"],
    ["Period 2", "9:00 – 9:50"],
    ["Period 3", "10:00 – 10:50"],
    ["Lunch", "11:00 – 11:40"],
  ];

  return (
    <div className={`${surface} overflow-hidden p-3 sm:p-4`}>
      <div className="flex aspect-[16/9] flex-col rounded-2xl bg-slate-50 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-white shadow-sm"><span className="h-4 w-4 rounded-full border-2 border-[#7d1116]" /></div>
            <span className="text-sm font-black sm:text-base">David&apos;s School</span>
          </div>
          <span className="text-xl font-black tracking-tight sm:text-3xl">10:55 <span className="text-[.55em]">AM</span></span>
        </div>
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[1.15fr_.85fr] gap-3">
          <div className="grid place-content-center rounded-2xl border border-slate-200 bg-white text-center shadow-sm">
            <p className="text-[.55rem] font-black uppercase tracking-[.18em] text-[#7d1116] sm:text-[.65rem]">Current period</p>
            <p className="mt-1 text-xl font-black sm:text-3xl">Period 2</p>
            <p className="mt-1 text-[.6rem] font-bold text-slate-500 sm:text-xs">9:00 AM – 9:50 AM</p>
            <div className="mx-auto mt-3 grid h-16 w-16 place-items-center rounded-full border-[7px] border-[#650b10] sm:h-24 sm:w-24 sm:border-[9px]">
              <p className="text-sm font-black sm:text-xl">18:42</p>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[.55rem] font-black uppercase tracking-[.16em] text-[#7d1116] sm:text-[.65rem]">Today&apos;s schedule</p>
              <div className="mt-2 space-y-1">
                {periods.map(([name, time], index) => (
                  <div key={name} className={index === 1 ? "flex justify-between rounded bg-[#f4eee1] px-2 py-1 text-[.5rem] font-black sm:text-[.65rem]" : "flex justify-between border-b border-slate-100 px-2 py-1 text-[.5rem] font-bold sm:text-[.65rem]"}>
                    <span>{name}</span><span className="text-slate-500">{time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[.55rem] font-black uppercase tracking-[.16em] text-[#7d1116] sm:text-[.65rem]">Upcoming events</p>
              <p className="mt-2 text-[.6rem] font-black sm:text-xs">See the school calendar</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPreview() {
  const actions = [
    ["Announcement", BellIcon],
    ["Event", CalendarIcon],
    ["Schedule", ClockIcon],
  ] as const;

  return (
    <div className={`${surface} overflow-hidden`}>
      <div className="grid min-h-[19rem] grid-cols-[5.5rem_1fr] sm:grid-cols-[8rem_1fr]">
        <aside className="bg-[#2f3136] p-3 text-white sm:p-4">
          <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white"><Image src="/sundial-launch-mark.webp" alt="" width={24} height={24} className="h-6 w-6 object-contain" /></span><span className="hidden text-xs font-black sm:inline">David&apos;s</span></div>
          <nav className="mt-6 space-y-2 text-[.55rem] font-bold sm:text-[.65rem]">
            {["Dashboard", "Schedules", "Calendar", "Events", "Announcements", "Athletics"].map((label, index) => (
              <div key={label} className={index === 0 ? "rounded-lg bg-white/15 px-2 py-2" : "px-2 py-2 text-white/70"}>{label}</div>
            ))}
          </nav>
        </aside>
        <div className="bg-slate-50 p-4 sm:p-6">
          <p className="text-xl font-black tracking-tight sm:text-2xl">Dashboard</p>
          <p className="mt-1 text-[.65rem] text-slate-500 sm:text-xs">What&apos;s happening today.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#7d1116] p-3 text-white sm:p-4"><p className="text-[.52rem] font-bold opacity-80 sm:text-[.6rem]">Today is</p><p className="mt-3 text-xs font-black sm:text-sm">REGULAR DAY</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"><p className="text-[.52rem] font-bold sm:text-[.6rem]">Upcoming events</p><p className="mt-3 text-xl font-black text-[#7d1116]">—</p></div>
          </div>
          <p className="mt-5 text-xs font-black">Quick actions</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {actions.map(([label, Icon]) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f4eee1] text-[#7d1116]"><Icon className="h-4 w-4" /></span>
                <span className="text-[.55rem] font-bold sm:text-[.62rem]">Add {label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const featureItems = [
  { title: "Calendar", body: "Publish school days, closures, schedules, and calendar changes.", icon: CalendarIcon },
  { title: "Bell schedules", body: "Show the current period, what comes next, and each day’s timing.", icon: ClockIcon },
  { title: "Events", body: "Keep upcoming dates and school activities easy to find.", icon: CalendarIcon },
  { title: "Athletics", body: "Share teams, opponents, game times, locations, and results.", icon: TrophyIcon },
  { title: "Announcements", body: "Post school updates once and surface them where people look.", icon: BellIcon },
  { title: "Quick links", body: "Put forms, documents, and everyday resources within easy reach.", icon: LinkIcon },
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-[#fbfaf7] text-slate-950 [--brand-brown:#3a1d0b] [--brand-gold:#d99b16]">
      <nav className="relative z-20 border-b border-slate-200/80 bg-[#fbfaf7]/90 backdrop-blur" aria-label="Main navigation">
        <div className="mx-auto flex min-h-20 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Sundial home"><SundialBrand /></Link>
          <div className="hidden items-center gap-7 text-sm font-bold text-slate-600 md:flex">
            <a href="#experiences" className="hover:text-slate-950">Experiences</a>
            <a href="#features" className="hover:text-slate-950">What it includes</a>
            <a href="#setup" className="hover:text-slate-950">School setup</a>
          </div>
          <a href={CONTACT_HREF} className="inline-flex min-h-11 items-center rounded-full bg-[#3a1d0b] px-4 text-sm font-black text-white transition hover:bg-[#542b10] sm:px-5">
            <span className="hidden sm:inline">Request a walkthrough</span><span className="sm:hidden">Contact</span>
          </a>
        </div>
      </nav>

      <section className="relative isolate">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_77%_18%,rgba(217,155,22,.22),transparent_28%),radial-gradient(circle_at_8%_72%,rgba(58,29,11,.08),transparent_24%)]" />
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Eyebrow>One school day, connected</Eyebrow>
            <h1 className="mt-5 text-[clamp(3.3rem,8vw,6.7rem)] font-black leading-[.9] tracking-[-.07em] text-slate-950">
              Know what&apos;s happening at school.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Sundial gives students, parents, and staff one clear place for the calendar, events, athletics, announcements, bell schedules, and school resources.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={DEMO_WEBSITE} className={primaryButton}>View the live school demo <ArrowIcon className="ml-2 h-4 w-4" /></a>
              <a href={CONTACT_HREF} className={secondaryButton}>Request a walkthrough</a>
            </div>
            <p className="mt-5 text-sm font-semibold text-slate-500">Built for the people checking the school day—and the staff keeping it current.</p>
          </div>
          <div className="relative min-h-[35rem] lg:min-h-[39rem]">
            <div className="absolute left-1/2 top-0 w-[22rem] -translate-x-[42%] rotate-2 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_35px_90px_rgb(15_23_42/0.16)] sm:w-[27rem] lg:left-auto lg:right-0 lg:translate-x-0">
              <WebsitePreview />
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-[68%] -rotate-3 sm:-translate-x-[82%] lg:left-0 lg:translate-x-0">
              <PhonePreview />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-6">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-x-4 gap-y-5 px-4 text-center sm:grid-cols-4 sm:px-6 lg:px-8">
          {["Public school website", "Installable school app", "Kiosk display", "Admin portal"].map((item) => (
            <p key={item} className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[.12em] text-slate-600 sm:text-sm"><CheckIcon className="h-4 w-4 text-[#b87900]" />{item}</p>
          ))}
        </div>
      </section>

      <section id="experiences" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Connected experiences" title="One update. Every place your school shows up." body="Sundial keeps the school website, mobile app, kiosk, and staff tools working from the same school information—so people see a consistent day wherever they check." />
          <div className="mt-12 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <WebsitePreview />
            <div className="lg:pl-6">
              <Eyebrow>Public school website</Eyebrow>
              <h3 className="mt-3 text-3xl font-black tracking-[-.04em]">A useful front door for the whole school.</h3>
              <p className="mt-4 leading-7 text-slate-600">Today&apos;s schedule, announcements, events, athletics, and resources are easy to reach on any screen.</p>
              <a href={DEMO_WEBSITE} className={`${secondaryButton} mt-6`}>View website demo <ArrowIcon className="ml-2 h-4 w-4" /></a>
            </div>
          </div>
          <div className="mt-16 grid items-center gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <div className="order-2 lg:order-1">
              <Eyebrow>Installable mobile app</Eyebrow>
              <h3 className="mt-3 text-3xl font-black tracking-[-.04em]">The school day in your pocket.</h3>
              <p className="mt-4 leading-7 text-slate-600">Students and families can open or install the app to see the current period, calendar, events, athletics, announcements, and quick links.</p>
              <a href={DEMO_APP} className={`${primaryButton} mt-6`}>Open the app demo <ArrowIcon className="ml-2 h-4 w-4" /></a>
            </div>
            <div className="order-1 flex justify-center lg:order-2"><PhonePreview /></div>
          </div>
          <div className="mt-16 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <KioskPreview />
            <div className="lg:pl-6">
              <Eyebrow>Kiosk display</Eyebrow>
              <h3 className="mt-3 text-3xl font-black tracking-[-.04em]">A live view for hallways and common spaces.</h3>
              <p className="mt-4 leading-7 text-slate-600">Show the current period, full bell schedule, upcoming events, athletics, and priority announcements on a desktop or TV-sized screen.</p>
              <a href={DEMO_KIOSK} className={`${secondaryButton} mt-6`}>View kiosk demo <ArrowIcon className="ml-2 h-4 w-4" /></a>
            </div>
          </div>
          <div className="mt-16 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="order-2 lg:order-1">
              <Eyebrow>Admin portal</Eyebrow>
              <h3 className="mt-3 text-3xl font-black tracking-[-.04em]">Manage the day without updating four separate places.</h3>
              <p className="mt-4 leading-7 text-slate-600">Authorized staff manage schedules, calendars, events, announcements, athletics, resources, notifications, and appearance from one portal.</p>
              <a href={CONTACT_HREF} className={`${primaryButton} mt-6`}>Request an admin walkthrough</a>
            </div>
            <div className="order-1 lg:order-2"><AdminPreview /></div>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <SectionHeading centered eyebrow="The school day" title="The information people look for most." body="Sundial brings everyday school information together with a consistent structure across the website, app, kiosk, and admin tools." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureItems.map(({ title, body, icon: Icon }) => (
              <article key={title} className="rounded-[1.5rem] border border-slate-200 bg-[#fbfaf7] p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f4e7c7] text-[#7c4d00]"><Icon className="h-6 w-6" /></span>
                <h3 className="mt-5 text-xl font-black tracking-tight">{title}</h3>
                <p className="mt-2 leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="setup" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#d99b16]/40 bg-[#fff5d8] px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-[#7c4d00]">Beta</span>
            <h2 className="mt-5 text-3xl font-black leading-[1.05] tracking-[-.045em] sm:text-4xl lg:text-5xl">Start with the documents your school already has.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">AI-assisted setup can help staff import and review school calendar documents. The feature is in beta, and staff stay in control of what is accepted and published.</p>
            <ul className="mt-6 space-y-3 text-sm font-bold text-slate-700">
              {["Upload existing school calendar documents", "Review detected dates and schedules", "Confirm changes before publishing"].map((item) => (
                <li key={item} className="flex items-center gap-3"><CheckIcon className="h-5 w-5 shrink-0 text-[#b87900]" />{item}</li>
              ))}
            </ul>
          </div>
          <div className={`${surface} p-5 sm:p-8`}>
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#9a6500]">Calendar setup</p><p className="mt-1 text-xl font-black">Import school calendar</p></div><span className="rounded-full bg-[#fff5d8] px-3 py-1 text-xs font-black text-[#7c4d00]">Beta</span></div>
            <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-7 text-center"><BookIcon className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-black">School calendar document</p><p className="mt-1 text-sm text-slate-500">PDF import with staff review</p></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["Upload", "Review", "Publish"].map((step, index) => (
                <div key={step} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-black text-[#9a6500]">0{index + 1}</p><p className="mt-1 text-sm font-black">{step}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[2.25rem] bg-[#32190a] px-6 py-12 text-white sm:px-10 sm:py-16 lg:px-16">
          <div aria-hidden="true" className="absolute right-0 top-0 h-72 w-72 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#d99b16]/30 blur-3xl" />
          <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#f2c866]">See Sundial in context</p><h2 className="mt-4 text-3xl font-black leading-tight tracking-[-.04em] sm:text-5xl">Start with the live school demo.</h2><p className="mt-4 max-w-2xl text-lg leading-8 text-white/70">Explore the connected website, app, and kiosk, or request a walkthrough of the full platform and admin tools.</p></div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><a href={DEMO_WEBSITE} className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#e2a623] px-6 text-sm font-black text-[#251309] transition hover:-translate-y-0.5 hover:bg-[#f0bd4c]">View live demo</a><a href={CONTACT_HREF} className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-black transition hover:bg-white/10">Contact Sundial</a></div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div><SundialBrand compact /><p className="mt-2 text-sm text-slate-500">Your day. Your schedule. Your school.</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600"><a href={DEMO_WEBSITE} className="hover:text-slate-950">School demo</a><a href={DEMO_APP} className="hover:text-slate-950">App demo</a><a href={DEMO_KIOSK} className="hover:text-slate-950">Kiosk demo</a><a href={CONTACT_HREF} className="hover:text-slate-950">Contact</a></div>
        </div>
      </footer>
    </main>
  );
}
