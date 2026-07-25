import type { Metadata } from "next";
import { getSundialFaviconMetadata } from "@/lib/tenantFavicon";

export function getTenantTitle(schoolName: string): Metadata["title"] {
  const name = schoolName.trim() || "Sundial";
  return {
    default: name,
    template: `%s | ${name}`,
  };
}

export function getKioskTitle(schoolName?: string | null): Metadata["title"] {
  const name = schoolName?.trim();
  return { absolute: name ? `${name} Kiosk` : "Sundial Kiosk" };
}

export function getSundialAdminMetadata(): Metadata {
  return {
    ...getSundialFaviconMetadata(),
    title: {
      default: "Sundial",
      template: "Sundial | %s",
    },
  };
}
