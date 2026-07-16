"use client";

import { useEffect, useRef, useState } from "react";
import SchoolLogo from "@/components/SchoolLogo";
import {
  analyzeLogoPixels,
  type LogoImageAnalysis,
  type PixelBounds,
} from "@/lib/logoImageAnalysis";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_LOGO_DIMENSION_PX,
  MAX_LOGO_SIZE_BYTES,
  RECOMMENDED_LOGO_DIMENSION_PX,
} from "@/lib/logoFiles";

type UploadLogoAction = (formData: FormData) => Promise<{ logoUrl: string }>;
type UpdateLogoAction = (school: string, logoUrl: string) => Promise<void>;

type SelectedLogo = {
  file: File;
  originalFile: File;
  previewUrl: string;
  analysis: LogoImageAnalysis | null;
  width: number | null;
  height: number | null;
  source: "original" | "trimmed";
};

type SchoolLogoUploadFieldProps = {
  school: string;
  schoolName: string;
  initialLogoUrl: string | null;
  uploadAction: UploadLogoAction;
  updateAction: UpdateLogoAction;
  uploadButtonClassName: string;
  compact?: boolean;
};

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

function getClientValidationMessage(file: File) {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return "SVG uploads are not enabled yet because they require sanitization. Use a transparent PNG or WebP logo.";
  }

  if (!ALLOWED_LOGO_MIME_TYPES.has(file.type)) {
    return "Use a PNG, JPG, or WebP logo.";
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return `Logo must be ${formatBytes(MAX_LOGO_SIZE_BYTES)} or smaller.`;
  }

  return null;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Logo preview failed."));
    image.src = url;
  });
}

function drawImageToCanvas(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0);

  return canvas;
}

async function analyzeSelectedLogo(previewUrl: string) {
  const image = await loadImage(previewUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (width > MAX_LOGO_DIMENSION_PX || height > MAX_LOGO_DIMENSION_PX) {
    throw new Error(`Logo dimensions must be ${MAX_LOGO_DIMENSION_PX}px or smaller.`);
  }

  const canvas = drawImageToCanvas(image);
  const imageData = canvas.getContext("2d")?.getImageData(0, 0, width, height);

  return {
    width,
    height,
    analysis: imageData
      ? analyzeLogoPixels({
          width,
          height,
          data: imageData.data,
        })
      : null,
  };
}

async function createTrimmedLogoFile(
  selectedLogo: SelectedLogo,
  bounds: PixelBounds
) {
  const image = await loadImage(selectedLogo.previewUrl);
  const sourceCanvas = drawImageToCanvas(image);
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const targetCanvas = document.createElement("canvas");

  targetCanvas.width = width;
  targetCanvas.height = height;
  targetCanvas
    .getContext("2d")
    ?.drawImage(sourceCanvas, bounds.left, bounds.top, width, height, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    targetCanvas.toBlob(resolve, "image/png")
  );

  if (!blob) {
    throw new Error("Could not create trimmed logo preview.");
  }

  return new File([blob], selectedLogo.file.name.replace(/\.[^.]+$/, "-trimmed.png"), {
    type: "image/png",
  });
}

function LogoPreviewPair({
  src,
  schoolName,
}: {
  src: string;
  schoolName: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: "Light preview", className: "bg-white text-slate-900" },
        { label: "Dark preview", className: "bg-slate-950 text-white" },
      ].map((preview) => (
        <div
          key={preview.label}
          className={[
            "rounded-2xl border border-slate-200 p-4 dark:border-[#3a3a3a]",
            preview.className,
          ].join(" ")}
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] opacity-65">
            {preview.label}
          </p>
          <div className="mt-3 grid h-28 place-items-center">
            <img
              src={src}
              alt={`${schoolName} selected logo preview`}
              className="max-h-24 max-w-full object-contain"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SchoolLogoUploadField({
  school,
  schoolName,
  initialLogoUrl,
  uploadAction,
  updateAction,
  uploadButtonClassName,
  compact = false,
}: SchoolLogoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl || "");
  const [selectedLogo, setSelectedLogo] = useState<SelectedLogo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [trimPreviewUrl, setTrimPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (selectedLogo?.previewUrl) URL.revokeObjectURL(selectedLogo.previewUrl);
      if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);
    };
  }, [selectedLogo?.previewUrl, trimPreviewUrl]);

  async function selectLogo(file: File) {
    setMessage("");
    setTrimPreviewUrl(null);

    const validationMessage = getClientValidationMessage(file);

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    try {
      const imageInfo = await analyzeSelectedLogo(previewUrl);

      setSelectedLogo({
        file,
        originalFile: file,
        previewUrl,
        analysis: imageInfo.analysis,
        width: imageInfo.width,
        height: imageInfo.height,
        source: "original",
      });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setSelectedLogo(null);
      setMessage(error instanceof Error ? error.message : "Logo preview failed.");
    }
  }

  async function uploadLogo(file: File, originalFile: File) {
    setUploading(true);
    setMessage("");

    try {
      const formData = new FormData();

      formData.set("school", school);
      formData.set("logo", file);

      if (file !== originalFile) {
        formData.set("originalLogo", originalFile);
      }

      const result = await uploadAction(formData);

      setLogoUrl(result.logoUrl);
      setSelectedLogo(null);
      setTrimPreviewUrl(null);
      setMessage(file === originalFile ? "Logo uploaded." : "Trimmed logo uploaded. Original file was preserved.");
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
      void selectLogo(file);
    }

    event.target.value = "";
  }

  async function removeLogo() {
    setUploading(true);

    try {
      setLogoUrl("");
      await updateAction(school, "");
      setMessage("Logo removed.");
    } catch (error) {
      console.error("Logo remove error:", error);
      setMessage(error instanceof Error ? error.message : "Logo remove failed.");
    } finally {
      setUploading(false);
    }
  }

  async function previewTrimmedLogo() {
    if (!selectedLogo?.analysis?.trimBounds) return;

    try {
      const trimmedFile = await createTrimmedLogoFile(
        selectedLogo,
        selectedLogo.analysis.trimBounds
      );
      const previewUrl = URL.createObjectURL(trimmedFile);
      const imageInfo = await analyzeSelectedLogo(previewUrl);

      if (trimPreviewUrl) URL.revokeObjectURL(trimPreviewUrl);

      setTrimPreviewUrl(previewUrl);
      setSelectedLogo({
        file: trimmedFile,
        originalFile: selectedLogo.originalFile,
        previewUrl,
        analysis: imageInfo.analysis,
        width: imageInfo.width,
        height: imageInfo.height,
        source: "trimmed",
      });
      setMessage("Review the trimmed preview before saving.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not trim logo.");
    }
  }

  async function keepOriginal() {
    if (!selectedLogo) return;

    await selectLogo(selectedLogo.originalFile);
    setMessage("Original logo selected.");
  }

  const analysis = selectedLogo?.analysis;
  const hasWarnings = Boolean(
    selectedLogo &&
      (selectedLogo.file.type === "image/jpeg" ||
        !analysis?.hasAlphaTransparency ||
        analysis?.hasSolidEdgeBackground ||
        analysis?.hasExcessPadding)
  );

  return (
    <div className={compact ? "flex flex-col text-sm" : "md:col-span-2"}>
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        School Logo
      </span>

      <div
        className={[
          "mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3a3a] dark:bg-black/30",
          compact ? "space-y-4 text-center" : "space-y-4",
        ].join(" ")}
      >
        <div className={compact ? "flex flex-col items-center gap-3" : "flex flex-col gap-4 sm:flex-row sm:items-center"}>
          <SchoolLogo
            schoolName={schoolName}
            logoUrl={logoUrl}
            variant="preview"
            className="rounded-3xl"
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
              Transparent PNG or WebP logos look best. JPG/JPEG files cannot
              contain transparency. Use a square canvas, at least{" "}
              {RECOMMENDED_LOGO_DIMENSION_PX}x{RECOMMENDED_LOGO_DIMENSION_PX},
              tightly cropped around the artwork, and {formatBytes(MAX_LOGO_SIZE_BYTES)} or smaller.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={uploadButtonClassName}
              >
                {uploading ? "Uploading..." : "Choose Logo"}
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
          </div>
        </div>

        {selectedLogo && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-[#3a3a3a] dark:bg-[#242424]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-white">
                  Review selected logo
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">
                  {selectedLogo.width}x{selectedLogo.height}px ·{" "}
                  {selectedLogo.source === "trimmed" ? "Trimmed preview" : "Original file"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogo(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-[#3a3a3a] dark:text-slate-200 dark:hover:bg-[#181818]"
              >
                Cancel
              </button>
            </div>

            <LogoPreviewPair src={selectedLogo.previewUrl} schoolName={schoolName} />

            {hasWarnings && (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
                {selectedLogo.file.type === "image/jpeg" && (
                  <p>JPG/JPEG files cannot contain transparency.</p>
                )}
                {!analysis?.hasAlphaTransparency && (
                  <p>This logo does not appear to contain alpha transparency.</p>
                )}
                {analysis?.hasSolidEdgeBackground && (
                  <p>
                    This logo appears to have a solid background. For the best
                    appearance, upload a transparent PNG or use Background Removal.
                  </p>
                )}
                {analysis?.hasExcessPadding && (
                  <p>This logo appears to have extra empty space around the artwork.</p>
                )}
                {analysis?.confidence === "low" && (
                  <p>Background removal may affect parts of this logo. Review the preview carefully.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {analysis?.hasExcessPadding && selectedLogo.source !== "trimmed" && (
                <button
                  type="button"
                  onClick={() => void previewTrimmedLogo()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white dark:hover:bg-[#101010]"
                >
                  Trim Empty Space
                </button>
              )}

              <button
                type="button"
                disabled
                title="Background removal needs a configured provider before it can be used safely."
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-400 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-500"
              >
                Remove Background
              </button>

              {selectedLogo.source === "trimmed" && (
                <button
                  type="button"
                  onClick={() => void keepOriginal()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white dark:hover:bg-[#101010]"
                >
                  Keep Original
                </button>
              )}

              <button
                type="button"
                onClick={() => void uploadLogo(selectedLogo.file, selectedLogo.originalFile)}
                disabled={uploading}
                className={uploadButtonClassName}
              >
                {uploading
                  ? "Saving..."
                  : selectedLogo.source === "trimmed"
                    ? "Approve Trimmed Logo"
                    : "Save Original Logo"}
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            {message}
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      <input type="hidden" name="logoUrl" value={logoUrl} />
    </div>
  );
}
