import { headers } from "next/headers";
import SchoolPublicNav from "@/components/SchoolPublicNav";
import { getForwardedHost, parseSundialHost } from "@/lib/routing/hosts";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const headerStore = await headers();
  const parsedHost = parseSundialHost(getForwardedHost(headerStore));
  const showPublicNav = parsedHost.kind !== "admin";

  return (
    <div className="school-public-theme min-h-screen bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      {showPublicNav && <SchoolPublicNav school={school} />}
      {children}
    </div>
  );
}
