export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION_PX = 4096;
export const RECOMMENDED_LOGO_DIMENSION_PX = 512;

export const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type LogoFileInfo = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number | null;
  height: number | null;
};

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] || 0) << 24) |
    ((bytes[offset + 1] || 0) << 16) |
    ((bytes[offset + 2] || 0) << 8) |
    (bytes[offset + 3] || 0)
  ) >>> 0;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0)) >>> 0;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8)) >>> 0;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16)
  ) >>> 0;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function getPngInfo(bytes: Uint8Array): LogoFileInfo | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return null;
  }

  return {
    mimeType: "image/png",
    extension: "png",
    width: bytes.length >= 24 ? readUint32BigEndian(bytes, 16) : null,
    height: bytes.length >= 24 ? readUint32BigEndian(bytes, 20) : null,
  };
}

function getJpegInfo(bytes: Uint8Array): LogoFileInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = readUint16BigEndian(bytes, offset + 2);

    if (length < 2) break;

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        height: readUint16BigEndian(bytes, offset + 5),
        width: readUint16BigEndian(bytes, offset + 7),
      };
    }

    offset += 2 + length;
  }

  return {
    mimeType: "image/jpeg",
    extension: "jpg",
    width: null,
    height: null,
  };
}

function getWebpInfo(bytes: Uint8Array): LogoFileInfo | null {
  if (
    bytes.length < 16 ||
    readAscii(bytes, 0, 4) !== "RIFF" ||
    readAscii(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }

  const chunk = readAscii(bytes, 12, 4);
  let width: number | null = null;
  let height: number | null = null;

  if (chunk === "VP8X" && bytes.length >= 30) {
    width = readUint24LittleEndian(bytes, 24) + 1;
    height = readUint24LittleEndian(bytes, 27) + 1;
  } else if (chunk === "VP8 " && bytes.length >= 30) {
    width = readUint16LittleEndian(bytes, 26) & 0x3fff;
    height = readUint16LittleEndian(bytes, 28) & 0x3fff;
  } else if (chunk === "VP8L" && bytes.length >= 25) {
    const bits =
      (bytes[21] || 0) |
      ((bytes[22] || 0) << 8) |
      ((bytes[23] || 0) << 16) |
      ((bytes[24] || 0) << 24);

    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  }

  return {
    mimeType: "image/webp",
    extension: "webp",
    width,
    height,
  };
}

export function inspectLogoBytes(bytes: Uint8Array): LogoFileInfo | null {
  return getPngInfo(bytes) || getJpegInfo(bytes) || getWebpInfo(bytes);
}

export async function validateLogoFileForUpload(file: File) {
  if (file.size === 0) {
    throw new Error("Choose a logo file to upload.");
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new Error("Logo must be 2MB or smaller.");
  }

  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new Error("SVG logo uploads are not enabled yet. Use a transparent PNG or WebP logo.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectLogoBytes(bytes);

  if (!info || !ALLOWED_LOGO_MIME_TYPES.has(info.mimeType)) {
    throw new Error("Use a PNG, JPG, or WebP logo.");
  }

  if (
    (info.width && info.width > MAX_LOGO_DIMENSION_PX) ||
    (info.height && info.height > MAX_LOGO_DIMENSION_PX)
  ) {
    throw new Error(`Logo dimensions must be ${MAX_LOGO_DIMENSION_PX}px or smaller.`);
  }

  return info;
}
