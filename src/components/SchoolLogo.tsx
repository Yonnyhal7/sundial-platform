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
  kioskHeader: "h-[clamp(4.25rem,7dvh,7rem)] w-[clamp(4.25rem,7dvh,7rem)] text-lg",
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
}: SchoolLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const uploadedLogoUrl = !imageFailed && logoUrl ? logoUrl : null;
  const hasLogo = Boolean(uploadedLogoUrl);

  return (
    <span
      className={[
        "grid shrink-0 place-items-center font-black",
        hasLogo
          ? "overflow-visible border-0 bg-transparent text-transparent"
          : "overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white",
        variantClasses[variant] || sizeClasses[size],
        variant === "default" ? sizeClasses[size] : "",
        className,
      ].join(" ")}
    >
      {uploadedLogoUrl ? (
        <img
          src={uploadedLogoUrl}
          alt={`${schoolName} logo`}
          onError={() => setImageFailed(true)}
          className={[
            "max-h-full max-w-full object-contain object-center",
            artworkClasses[variant] || artworkClasses.default,
          ].join(" ")}
        />
      ) : (
        <Image
          src="/sundial-icon.png"
          alt=""
          aria-hidden="true"
          width={640}
          height={696}
          className={[
            "object-contain",
            artworkClasses[variant] || artworkClasses.default,
          ].join(" ")}
        />
      )}
    </span>
  );
}
