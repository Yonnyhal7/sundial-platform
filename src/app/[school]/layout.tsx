import Link from "next/link";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;

  const navItems = [
    { label: "Home", href: `/${school}` },
    { label: "Announcements", href: `/${school}/announcements` },
    { label: "Events", href: `/${school}/events` },
    { label: "Resources", href: `/${school}/resources` },
    { label: "Schedule", href: `/${school}/schedule` },
    { label: "Kiosk", href: `/${school}/kiosk` },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-neutral-800 px-6 py-4">
        <div className="flex flex-wrap gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-neutral-300 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {children}
    </div>
  );
}