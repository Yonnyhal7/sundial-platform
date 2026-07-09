"use client";

import { useRef, useState } from "react";
import SchoolLogo from "@/components/SchoolLogo";
import { updateSchoolLogoAction, uploadSchoolLogoAction } from "./actions";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

type LogoUploadFieldProps = {
  school: string;
  schoolName: string;
  initialLogoUrl: string | null;
};

export default function LogoUploadField({
  school,
  schoolName,
  initialLogoUrl,
}: LogoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl || "");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadLogo(file: File) {
    setMessage("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("Use a PNG, JPG, WEBP, or SVG logo.");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setMessage("Logo must be 2MB or smaller.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.set("school", school);
      formData.set("logo", file);
      const result = await uploadSchoolLogoAction(formData);

      setLogoUrl(result.logoUrl);
      setMessage("Logo uploaded.");
    } catch (error) {
      console.error("Logo upload error:", error);
      setMessage(error instanceof Error ? error.message : "Logo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void uploadLogo(file);
    }

    event.target.value = "";
  }

  async function removeLogo() {
    setUploading(true);

    try {
      setLogoUrl("");
      await updateSchoolLogoAction(school, "");
      setMessage("Logo removed.");
    } catch (error) {
      console.error("Logo remove error:", error);
      setMessage(error instanceof Error ? error.message : "Logo remove failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="md:col-span-2">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        School Logo
      </span>

      <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3a3a] dark:bg-black/30 sm:flex-row sm:items-center">
        <SchoolLogo
          schoolName={schoolName}
          logoUrl={logoUrl}
          size="xl"
          className="rounded-3xl"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Upload a square or horizontal school logo. It will be contained
            without stretching.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer rounded-xl bg-[var(--school-primary)] px-4 py-2.5 text-sm font-bold text-[var(--school-primary-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload Logo"}
            </button>

            {logoUrl && (
              <button
                type="button"
                onClick={() => void removeLogo()}
                disabled={uploading}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white dark:hover:bg-[#181818]"
              >
                Remove Logo
              </button>
            )}
          </div>

          {message && (
            <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-300">
              {message}
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />
      <input type="hidden" name="logoUrl" value={logoUrl} />
    </div>
  );
}
