import Link from "next/link";

export default function SchoolNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
          School Not Found
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          We could not find that Sundial school site.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Check the school subdomain or ask your school office for the correct
          Sundial link.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          Go to Sundial
        </Link>
      </div>
    </main>
  );
}
