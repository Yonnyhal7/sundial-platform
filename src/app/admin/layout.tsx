import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSundialAdminMetadata } from "@/lib/tabTitles";

export const metadata: Metadata = getSundialAdminMetadata();

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
