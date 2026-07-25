import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSundialFaviconMetadata } from "@/lib/tenantFavicon";

export const metadata: Metadata = getSundialFaviconMetadata();

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
