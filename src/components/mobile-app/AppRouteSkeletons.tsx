function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-200/80 dark:bg-[#2f2f2f] ${className}`}
    />
  );
}

function PageHeaderSkeleton() {
  return (
    <header>
      <SkeletonBlock className="h-4 w-20" />
      <SkeletonBlock className="mt-3 h-9 w-64 max-w-full" />
      <SkeletonBlock className="mt-3 h-4 w-48 max-w-full" />
    </header>
  );
}

export function HomeLoadingSkeleton() {
  return (
    <main className="space-y-[clamp(1.25rem,3.2vw,1.75rem)]">
      <section className="pt-[clamp(0.75rem,2vw,1rem)] text-center">
        <SkeletonBlock className="mx-auto h-7 w-36" />
        <SkeletonBlock className="mx-auto mt-4 h-12 w-72 max-w-full" />
        <SkeletonBlock className="mx-auto mt-6 h-5 w-44" />
        <SkeletonBlock className="mx-auto mt-6 h-0.5 w-16" />
      </section>

      <section className="rounded-[clamp(1.1rem,3.2vw,1.75rem)] border border-slate-200 bg-white px-[clamp(1rem,4vw,1.5rem)] py-[clamp(1.25rem,4.5vw,2rem)] shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <SkeletonBlock className="mx-auto h-4 w-28" />
        <SkeletonBlock className="mx-auto mt-5 h-8 w-52 max-w-full" />
        <SkeletonBlock className="mx-auto mt-8 h-48 w-48 rounded-full" />
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] gap-4">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14 w-px rounded-none" />
          <SkeletonBlock className="h-14" />
        </div>
      </section>

      <section className="rounded-[clamp(1.1rem,3.2vw,1.75rem)] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <SkeletonBlock className="h-5 w-40" />
        <div className="mt-5 space-y-4">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      </section>
    </main>
  );
}

export function ScheduleLoadingSkeleton() {
  return (
    <main className="space-y-5">
      <PageHeaderSkeleton />
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
          <SkeletonBlock className="h-10 w-10 rounded-full" />
          <SkeletonBlock className="mx-auto h-7 w-40" />
          <SkeletonBlock className="h-10 w-10 rounded-full" />
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, index) => (
            <SkeletonBlock key={index} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgb(15_23_42/0.08)] dark:border-[#3a3a3a] dark:bg-[#242424]">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="mt-3 h-8 w-56 max-w-full" />
        <div className="mt-5 space-y-3">
          <SkeletonBlock className="h-14" />
          <SkeletonBlock className="h-14" />
        </div>
      </section>
    </main>
  );
}

export function ListPageLoadingSkeleton() {
  return (
    <main className="space-y-5">
      <PageHeaderSkeleton />
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="mt-16 h-9 w-64 max-w-full" />
        <div className="mt-5 flex gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-24 rounded-full" />
        </div>
      </section>
      <section className="space-y-3">
        <SkeletonBlock className="h-6 w-36" />
        <SkeletonBlock className="h-24 rounded-[1.5rem]" />
        <SkeletonBlock className="h-24 rounded-[1.5rem]" />
        <SkeletonBlock className="h-24 rounded-[1.5rem]" />
      </section>
    </main>
  );
}
