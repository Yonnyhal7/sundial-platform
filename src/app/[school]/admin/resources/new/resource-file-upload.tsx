"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useState } from "react";

const supabase = createSupabaseBrowserClient();

export default function ResourceFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState("");

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `resources/${fileName}`;

    const { error } = await supabase.storage
      .from("resource-file")
      .upload(filePath, file);

    if (error) {
      console.error("File upload error:", error);
      alert("File upload failed.");
      setUploading(false);
      return;
    }

    const { data, error: signedUrlError } = await supabase.storage
    .from("resource-file")
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedUrlError) {
    console.error("Signed URL error:", signedUrlError);
    alert("File uploaded, but URL creation failed.");
    setUploading(false);
    return;
    }

    setFileUrl(data.signedUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-300">
        Upload File
      </label>

      <input
        type="file"
        onChange={handleUpload}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white"
      />

      {uploading && (
        <p className="text-sm text-slate-400">Uploading file...</p>
      )}

      {fileUrl && (
        <p className="text-sm text-green-300">File uploaded successfully.</p>
      )}

      <input type="hidden" name="file_url" value={fileUrl} />
    </div>
  );
}