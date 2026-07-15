import Image from "next/image";

type SchoolLogoSize = "sm" | "md" | "lg" | "xl";

type SchoolLogoProps = {
  schoolName: string;
  logoUrl?: string | null;
  size?: SchoolLogoSize;
  className?: string;
};

const sizeClasses: Record<SchoolLogoSize, string> = {
  sm: "h-8 w-8 text-[0.65rem]",
  md: "h-10 w-10 text-xs",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
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
  className = "",
}: SchoolLogoProps) {
  const hasLogo = Boolean(logoUrl);

  return (
    <span
      className={[
        "grid shrink-0 place-items-center overflow-hidden font-black",
        hasLogo
          ? "border-0 bg-transparent text-transparent"
          : "rounded-2xl border border-slate-200 bg-white text-slate-950 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white",
        sizeClasses[size],
        className,
      ].join(" ")}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${schoolName} logo`}
          className="h-full w-full object-contain"
        />
      ) : (
        <Image
          src="/sundial-icon.png"
          alt=""
          aria-hidden="true"
          width={640}
          height={696}
          className="h-full w-full object-contain"
        />
      )}
    </span>
  );
}
