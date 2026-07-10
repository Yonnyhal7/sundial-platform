import Link from "next/link";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  HomeIcon,
} from "@/components/mobile-app/AppIcons";
import { requireMobileAppSchool } from "@/lib/mobileAppData";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  publish_at: string;
};

export default async function MobileMorePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const [supabase, schoolData] = await Promise.all([
    createSupabaseServerClient(),
    requireMobileAppSchool(school),
  ]);

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, publish_at")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(5)
    .returns<Announcement[]>();

  const items = [
    { title: "Bell Schedule", href: `/${school}/app/bell`, icon: BellIcon },
    { title: "Calendar", href: `/${school}/app/schedule`, icon: CalendarIcon },
    { title: "Athletics", href: `/${school}/app/athletics`, icon: BellIcon },
    { title: "Resources", href: `/${school}/app/resources`, icon: BookIcon },
    { title: "Public Website", href: `/${school}`, icon: HomeIcon },
  ];

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          More
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {schoolData.name}
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-black text-slate-950 dark:text-white">
                {item.title}
              </h2>
            </Link>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950 dark:text-white">
          Announcements
        </h2>

        {announcements?.map((announcement) => (
          <article
            key={announcement.id}
            className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
          >
            <h3 className="font-black text-slate-950 dark:text-white">
              {announcement.title}
            </h3>
            {announcement.body && (
              <p className="mt-2 line-clamp-3 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                {announcement.body}
              </p>
            )}
          </article>
        ))}

        {!announcements?.length && (
          <p className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-[#a3a3a3]">
            No announcements are posted yet.
          </p>
        )}
      </section>
    </main>
  );
}
