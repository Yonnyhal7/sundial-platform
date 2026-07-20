"use client";
import { usePathname } from "next/navigation";
import { PublicSiteFooter } from "./PublicSite";

export default function PublicFooterRoute({ school, base }: Parameters<typeof PublicSiteFooter>[0]) {
  const pathname = usePathname();
  if (pathname.includes("/app") || pathname.includes("/kiosk") || pathname.includes("/admin")) return null;
  return <PublicSiteFooter school={school} base={base} />;
}
