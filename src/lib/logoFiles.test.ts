import { describe, expect, it } from "vitest";
import {
  inspectLogoBytes,
  validateLogoFileForUpload,
} from "@/lib/logoFiles";

function pngBytes(width = 512, height = 512) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);

  view.setUint32(16, width);
  view.setUint32(20, height);

  return bytes;
}

function jpegBytes(width = 512, height = 512) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);
}

function webpBytes(width = 512, height = 512) {
  const bytes = new Uint8Array(30);
  bytes.set([...Buffer.from("RIFF")], 0);
  bytes.set([...Buffer.from("WEBP")], 8);
  bytes.set([...Buffer.from("VP8X")], 12);
  const storedWidth = width - 1;
  const storedHeight = height - 1;

  bytes[24] = storedWidth & 0xff;
  bytes[25] = (storedWidth >> 8) & 0xff;
  bytes[26] = (storedWidth >> 16) & 0xff;
  bytes[27] = storedHeight & 0xff;
  bytes[28] = (storedHeight >> 8) & 0xff;
  bytes[29] = (storedHeight >> 16) & 0xff;

  return bytes;
}

describe("logo file validation", () => {
  it("accepts transparent-capable PNG uploads by file contents", async () => {
    const file = new File([pngBytes()], "logo.jpg", { type: "image/jpeg" });

    await expect(validateLogoFileForUpload(file)).resolves.toMatchObject({
      mimeType: "image/png",
      extension: "png",
      width: 512,
      height: 512,
    });
  });

  it("accepts JPEG uploads while recognizing they cannot carry transparency", () => {
    expect(inspectLogoBytes(jpegBytes())).toMatchObject({
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 512,
      height: 512,
    });
  });

  it("accepts WebP uploads by file contents", () => {
    expect(inspectLogoBytes(webpBytes())).toMatchObject({
      mimeType: "image/webp",
      extension: "webp",
      width: 512,
      height: 512,
    });
  });

  it("rejects SVG until sanitization support exists", async () => {
    const file = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });

    await expect(validateLogoFileForUpload(file)).rejects.toThrow(
      "SVG logo uploads are not enabled yet"
    );
  });

  it("rejects invalid image contents even with an image filename", async () => {
    const file = new File(["not an image"], "logo.png", { type: "image/png" });

    await expect(validateLogoFileForUpload(file)).rejects.toThrow(
      "Use a PNG, JPG, or WebP logo."
    );
  });

  it("rejects oversized files", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", {
      type: "image/png",
    });

    await expect(validateLogoFileForUpload(file)).rejects.toThrow(
      "Logo must be 2MB or smaller."
    );
  });

  it("rejects excessive image dimensions", async () => {
    const file = new File([pngBytes(5000, 512)], "logo.png", {
      type: "image/png",
    });

    await expect(validateLogoFileForUpload(file)).rejects.toThrow(
      "Logo dimensions must be 4096px or smaller."
    );
  });
});
