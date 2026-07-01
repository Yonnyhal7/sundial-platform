import SchoolPublicNav from "@/components/SchoolPublicNav";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;

  return (
    <div className="school-public-theme min-h-screen bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      <SchoolPublicNav school={school} />
      {children}
    </div>
  );
}
