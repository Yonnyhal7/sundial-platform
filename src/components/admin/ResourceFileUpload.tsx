"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useState } from "react";

const supabase = createSupabaseBrowserClient();

export default function ResourceFileUpload({
  schoolId,
  initialFileUrl = "",
}: {
  schoolId: string;
  initialFileUrl?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState(initialFileUrl);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `schools/${schoolId}/resources/${fileName}`;

    const { error } = await supabase.storage
      .from("resource-file")
      .upload(filePath, file);

    if (error) {
      console.error("File upload error:", error);
      alert("File upload failed.");
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("resource-file").getPublicUrl(filePath);

    setFileUrl(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
        {initialFileUrl ? "Resource File" : "Upload File"}
      </label>

      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-sm font-semibold text-[var(--school-primary)] hover:underline"
        >
          View current file
        </a>
      )}

      <input
        type="file"
        onChange={handleUpload}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
      />

      {uploading && (
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Uploading file...
        </p>
      )}

      {!uploading && fileUrl && (
        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
          File ready.
        </p>
      )}

      <input type="hidden" name="file_url" value={fileUrl} />
    </div>
  );
}
