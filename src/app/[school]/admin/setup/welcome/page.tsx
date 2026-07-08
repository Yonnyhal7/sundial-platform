import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";

type WelcomePageProps = {
  params: Promise<{ school: string }>;
};

export default async function WelcomeSetupPage({ params }: WelcomePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);
  const checklistItems = [
    {
      title: "🏫 School Information",
      body: "Add your school's basic information, mascot and logo.",
    },
    {
      title: "🎨 Branding",
      body: "Choose your colors and customize the experience.",
    },
    {
      title: "👥 Administrators",
      body: "Invite administrators and editors.",
    },
    {
      title: "📅 Schedule",
      body: "Build your default bell schedule.",
    },
  ];

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="welcome"
      nextStep="school-profile"
      continueLabel="Get Started →"
    >
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424] lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#D4A017]/15 text-5xl">
            🏫
          </div>
          <h2 className="mt-7 text-4xl font-bold tracking-tight">
            Welcome to Sundial! 👋
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">
            You&apos;re only a few minutes away from launching your school&apos;s
            new communication platform.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="rounded-full bg-slate-100 px-4 py-2 font-medium dark:bg-black">
              Estimated setup time: 10 minutes
            </span>
            <span className="rounded-full bg-slate-100 px-4 py-2 font-medium dark:bg-black">
              Save your progress at any time
            </span>
          </div>
        </div>

        <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {checklistItems.map((item) => (
            <div
              key={item.title}
              className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-start"
            >
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-black sm:grid-cols-2">
          <div className="border-b border-slate-200 p-5 dark:border-slate-700 sm:border-b-0 sm:border-r">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              School Website
            </p>
            <p className="mt-2 font-mono text-lg font-semibold">
              {context.schoolData.subdomain}.sundialk12.com
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              This URL will become your school&apos;s public homepage.
            </p>
          </div>

          <div className="p-5">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Admin Dashboard
            </p>
            <p className="mt-2 font-mono text-lg font-semibold">
              admin.sundialk12.com/{context.schoolData.subdomain}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Bookmark this link to manage your school.
            </p>
          </div>
        </div>
      </section>
    </SetupLayout>
  );
}
