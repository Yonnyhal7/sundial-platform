import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { inspectLogoBytes, MAX_LOGO_SIZE_BYTES } from "@/lib/logoFiles";
import { getSchoolForSetup } from "@/lib/schools";
import { SUNDIAL_FAVICON_PATH } from "@/lib/tenantFavicon";

const LOGO_FETCH_TIMEOUT_MS = 5_000;

function fallback(request: NextRequest) {
  return NextResponse.redirect(new URL(SUNDIAL_FAVICON_PATH, request.url), 307);
}

function isFetchableLogoUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const ipVersion = isIP(hostname);
    const isPrivateIpv4 =
      ipVersion === 4 &&
      /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
        hostname
      );
    const isPrivateIpv6 =
      ipVersion === 6 &&
      (hostname === "::1" ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        hostname.startsWith("fe8") ||
        hostname.startsWith("fe9") ||
        hostname.startsWith("fea") ||
        hostname.startsWith("feb"));

    return (
      (url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && url.protocol === "http:")) &&
      url.username === "" &&
      url.password === "" &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !isPrivateIpv4 &&
      !isPrivateIpv6
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ school: string }> }
) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);
  const logoUrl = schoolData?.logo_url?.trim();

  if (!logoUrl || !isFetchableLogoUrl(logoUrl)) {
    return fallback(request);
  }

  try {
    const response = await fetch(logoUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
    });
    const contentLength = Number(response.headers.get("content-length") || "0");

    if (
      !response.ok ||
      (contentLength > 0 && contentLength > MAX_LOGO_SIZE_BYTES)
    ) {
      return fallback(request);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const logo = inspectLogoBytes(bytes);

    if (!logo || bytes.byteLength > MAX_LOGO_SIZE_BYTES) {
      return fallback(request);
    }

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Type": logo.mimeType,
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return fallback(request);
  }
}
