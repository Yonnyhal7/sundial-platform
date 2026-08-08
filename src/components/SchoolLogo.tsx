"use client";

import Image from "next/image";
import { useState } from "react";

type SchoolLogoSize = "sm" | "md" | "lg" | "xl";
type SchoolLogoVariant =
  | "default"
  | "adminSidebar"
  | "appHeader"
  | "kioskHeader"
  | "websiteHeader"
  | "preview";

type SchoolLogoProps = {
  schoolName: string;
  logoUrl?: string | null;
  size?: SchoolLogoSize;
  variant?: SchoolLogoVariant;
  className?: string;
  allowArtworkOverflow?: boolean;
};

const sizeClasses: Record<SchoolLogoSize, string> = {
  sm: "h-8 w-8 text-[0.65rem]",
  md: "h-10 w-10 text-xs",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

const variantClasses: Record<SchoolLogoVariant, string> = {
  default: "",
  adminSidebar: "h-11 w-11 text-sm",
  appHeader:
    "h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)] rounded-[clamp(0.9rem,2.4vw,1.35rem)] text-xs",
  kioskHeader:
    "h-[clamp(4.25rem,7dvh,7rem)] w-[clamp(4.25rem,7dvh,7rem)] text-lg",
  websiteHeader: "h-16 w-16 text-lg",
  preview: "h-24 w-24 text-2xl",
};

const artworkClasses: Record<SchoolLogoVariant, string> = {
  default: "h-full w-full",
  adminSidebar: "h-[78%] w-[78%]",
  appHeader: "h-[76%] w-[76%]",
  kioskHeader: "h-[86%] w-[86%]",
  websiteHeader: "h-[84%] w-[84%]",
  preview: "h-[84%] w-[84%]",
};

const sizeImageSizes: Record<SchoolLogoSize, string> = {
  sm: "32px",
  md: "40px",
  lg: "64px",
  xl: "96px",
};

const variantImageSizes: Record<SchoolLogoVariant, string | null> = {
  default: null,
  adminSidebar: "35px",
  appHeader: "(max-width: 480px) 37px, 49px",
  kioskHeader: "96px",
  websiteHeader: "54px",
  preview: "(min-width: 1024px) 135px, 81px",
};

export function getSchoolLogoImageSizes(
  variant: SchoolLogoVariant,
  size: SchoolLogoSize,
) {
  return variantImageSizes[variant] || sizeImageSizes[size];
}

export function canOptimizeSchoolLogo(logoUrl: string) {
  try {
    const url = new URL(logoUrl);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/school-logos/")
    );
  } catch {
    return false;
  }
}

export function getSchoolInitials(schoolName: string) {
  return schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function SchoolLogo({
  schoolName,
  logoUrl,
  size = "md",
  variant = "default",
  className = "",
  allowArtworkOverflow = false,
}: SchoolLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const uploadedLogoUrl = !imageFailed && logoUrl ? logoUrl : null;
  const hasLogo = Boolean(uploadedLogoUrl);
  const artworkClassName = artworkClasses[variant] || artworkClasses.default;

  return (
    <span
      className={[
        "grid shrink-0 place-items-center font-black",
        hasLogo
          ? `${allowArtworkOverflow ? "overflow-visible" : "overflow-hidden"} border-0 bg-transparent text-transparent`
          : "overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white",
        variantClasses[variant] || sizeClasses[size],
        variant === "default" ? sizeClasses[size] : "",
        className,
      ].join(" ")}
    >
      {uploadedLogoUrl ? (
        <Image
          src={uploadedLogoUrl}
          alt={`${schoolName} logo`}
          width={160}
          height={160}
          sizes={getSchoolLogoImageSizes(variant, size)}
          unoptimized={!canOptimizeSchoolLogo(uploadedLogoUrl)}
          onError={() => setImageFailed(true)}
          className={["object-contain object-center", artworkClassName].join(
            " ",
          )}
        />
      ) : (
        <Image
          src="/sundial-icon.png"
          alt=""
          aria-hidden="true"
          width={640}
          height={696}
          className={["object-contain", artworkClassName].join(" ")}
        />
      )}
    </span>
  );
}
