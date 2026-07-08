"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  ResourcesIcon,
  UserIcon,
} from "@/components/admin/AdminNavIcons";

const navItems = [
  { label: "Dashboard", href: "/admin/dashboard", icon: DashboardIcon },
  { label: "Schools", href: "/admin/dashboard/schools", icon: ResourcesIcon },
  { label: "Users", href: "/admin/dashboard/users", icon: UserIcon },
  { label: "Subscriptions", href: "/admin/dashboard/subscriptions", icon: DashboardIcon },
  { label: "Analytics", href: "/admin/dashboard/analytics", icon: DashboardIcon },
  { label: "Settings", href: "/admin/dashboard/settings", icon: DashboardIcon },
];

export default function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar-width)] flex-col bg-zinc-800 px-4 py-6 text-white shadow-2xl shadow-black/20 dark:bg-black lg:flex">
      <Link href="/admin/dashboard" className="flex items-center gap-3 px-2">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden">
          <Image
            src="/sundial-icon.png"
            alt="Sundial"
            width={48}
            height={48}
            className="h-full w-full object-contain"
          />
        </span>
        <span className="truncate text-2xl font-bold tracking-tight">Sundial</span>
      </Link>

      <nav className="mt-8 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/admin/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-black/15"
                  : "text-white hover:bg-white/10",
              ].join(" ")}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
