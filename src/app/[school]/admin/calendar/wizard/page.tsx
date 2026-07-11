import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolAdminPath, requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { getSchoolForSetup } from "@/lib/schools";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

export default async function CalendarWizardChoicePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  await requireAdminSectionAccess(schoolData.id, "calendar", school);
  const adminBasePath = await getSchoolAdminPath(school);

  const options = [
    {
      title: "AI Calendar Import",
      badge: "Beta",
      description:
        "Upload your school calendar PDF and let Sundial build the calendar draft for you.",
      highlights: [
        "Upload a PDF",
        "Review detected dates and schedules",
        "Create missing schedules automatically",
        "Add bell times now or later",
      ],
      href: `${adminBasePath}/calendar/wizard/ai`,
      cta: "Use AI Import",
    },
    {
      title: "Guided Setup",
      description: "Build your school-year calendar step by step.",
      highlights: [
        "Set school-year dates",
        "Choose the normal schedule pattern",
        "Add no-school days",
        "Add special days",
        "Review before creating",
      ],
      href: `${adminBasePath}/calendar/wizard/guided`,
      cta: "Start Guided Setup",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {schoolData.name} Admin
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Create School-Year Calendar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              How would you like to build your calendar?
            </p>
          </div>
          <Link href={`${adminBasePath}/calendar`} className="text-sm font-bold text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
            Back to Calendar
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {options.map((option) => (
            <section
              key={option.title}
              className="flex min-h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-bold">{option.title}</h2>
                {option.badge && (
                  <span className="rounded-full bg-[#D4A017]/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#9A7209] dark:text-[#F6C64A]">
                    {option.badge}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {option.description}
              </p>
              <ul className="mt-5 flex-1 space-y-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {option.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-[#D4A017]" aria-hidden="true" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link href={option.href} className={sundialPrimaryButtonClass("w-full sm:w-auto")}>
                  {option.cta}
                </Link>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
