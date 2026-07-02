import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  LinkIcon,
  MapPinIcon,
} from "@/components/mobile-app/AppIcons";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type School = {
  id: string;
};

type Resource = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_url: string | null;
  category: string | null;
};

export default async function MobileResourcesPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, description, url, file_url, category")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true })
    .limit(12)
    .returns<Resource[]>();

  const quickLinks = [
    { title: "Resources", label: "Helpful links", href: `/${school}/app/resources`, icon: BookIcon },
    { title: "Clubs", label: "Student life", href: `/${school}/app/more`, icon: CalendarIcon },
    { title: "Athletics", label: "Teams and games", href: `/${school}/app/athletics`, icon: BellIcon },
    { title: "Counseling", label: "Support", href: `/${school}/app/more`, icon: MapPinIcon },
    { title: "Bell Schedule", label: "Period times", href: `/${school}/app/bell`, icon: BellIcon },
    { title: "Contact", label: "School info", href: `/${school}/app/more`, icon: MapPinIcon },
  ];

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-bold text-[var(--school-primary)]">
          Resources
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          Find What You Need
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 dark:border-[#3a3a3a] dark:bg-[#242424]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-black text-slate-950 dark:text-white">
                {item.title}
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-[#a3a3a3]">
                {item.label}
              </p>
            </Link>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950 dark:text-white">
          School Links
        </h2>

        {resources?.map((resource) => {
          const href = resource.url || resource.file_url || `/${school}/app/resources`;
          const external = Boolean(resource.url || resource.file_url);

          return (
            <a
              key={resource.id}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-[#181818] dark:text-[#a3a3a3]">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-black text-slate-950 dark:text-white">
                  {resource.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                  {resource.description || resource.category || "Open resource"}
                </p>
              </div>
            </a>
          );
        })}

        {!resources?.length && (
          <p className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-[#a3a3a3]">
            No school resources are posted yet.
          </p>
        )}
      </section>
    </main>
  );
}
