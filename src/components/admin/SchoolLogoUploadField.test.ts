import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadFieldSource = readFileSync(
  new URL("./SchoolLogoUploadField.tsx", import.meta.url),
  "utf8"
);
const schoolLogoSource = readFileSync(
  new URL("../SchoolLogo.tsx", import.meta.url),
  "utf8"
);
const appHeaderSource = readFileSync(
  new URL("../mobile-app/AppHeader.tsx", import.meta.url),
  "utf8"
);
const kioskSource = readFileSync(
  new URL("../../app/[school]/kiosk/KioskDisplay.tsx", import.meta.url),
  "utf8"
);
const settingsActionsSource = readFileSync(
  new URL("../../app/[school]/admin/settings/actions.ts", import.meta.url),
  "utf8"
);
const setupActionsSource = readFileSync(
  new URL("../../app/[school]/admin/setup/actions.ts", import.meta.url),
  "utf8"
);

describe("school logo upload and rendering contracts", () => {
  it("shows light and dark previews before upload", () => {
    expect(uploadFieldSource).toContain("Light preview");
    expect(uploadFieldSource).toContain("Dark preview");
    expect(uploadFieldSource).toContain("Review selected logo");
  });

  it("explains transparent formats and JPEG limitations", () => {
    expect(uploadFieldSource).toContain("Transparent PNG or WebP logos look best");
    expect(uploadFieldSource).toContain("JPG/JPEG files cannot contain transparency");
  });

  it("keeps background removal explicit and disabled until a safe provider exists", () => {
    expect(uploadFieldSource).toContain("Remove Background");
    expect(uploadFieldSource).toContain("Background removal needs a configured provider");
    expect(uploadFieldSource).not.toContain("removeWhite");
  });

  it("supports trimming empty space with review and keep-original controls", () => {
    expect(uploadFieldSource).toContain("Trim Empty Space");
    expect(uploadFieldSource).toContain("Keep Original");
    expect(uploadFieldSource).toContain("Approve Trimmed Logo");
  });

  it("preserves original logo files when uploading a processed derivative", () => {
    expect(uploadFieldSource).toContain('formData.set("originalLogo", originalFile)');
    expect(settingsActionsSource).toContain("logos/originals");
    expect(setupActionsSource).toContain("logos/originals");
  });

  it("uses byte-level upload validation and rejects SVG without sanitization", () => {
    expect(settingsActionsSource).toContain("validateLogoFileForUpload");
    expect(setupActionsSource).toContain("validateLogoFileForUpload");
    expect(uploadFieldSource).toContain("SVG uploads are not enabled yet");
    expect(uploadFieldSource).toContain('accept="image/png,image/jpeg,image/webp"');
  });

  it("keeps App header logo dimensions matched to the menu and notification controls", () => {
    expect(appHeaderSource).toContain('variant="appHeader"');
    expect(schoolLogoSource).toContain("h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)]");
    expect(appHeaderSource).toContain("h-[clamp(3rem,8vw,4rem)] w-[clamp(3rem,8vw,4rem)]");
  });

  it("uses object-contain logo artwork and image failure fallback", () => {
    expect(schoolLogoSource).toContain("object-contain");
    expect(schoolLogoSource).toContain("onError={() => setImageFailed(true)}");
    expect(schoolLogoSource).toContain('src="/sundial-icon.png"');
  });

  it("uses a kiosk-specific logo variant sized separately from mobile buttons", () => {
    expect(kioskSource).toContain('variant="kioskHeader"');
    expect(schoolLogoSource).toContain("h-[clamp(4.25rem,7dvh,7rem)]");
  });
});
