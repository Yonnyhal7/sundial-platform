import { NextResponse } from "next/server";
import { exchangeSchoolSetupInvitationToken } from "@/lib/invitations/acceptance.server";
import { SCHOOL_SETUP_ACCEPTANCE_COOKIE } from "@/lib/invitations/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rawToken = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    rawToken = typeof body.token === "string" ? body.token : "";
  } catch {
    // Malformed request bodies are verified as invalid without exposing details.
  }

  const result = await exchangeSchoolSetupInvitationToken(rawToken);
  const response = NextResponse.json(
    { view: result.view },
    { headers: { "Cache-Control": "no-store" } }
  );

  if (result.sessionToken && result.sessionExpiresAt) {
    response.cookies.set(SCHOOL_SETUP_ACCEPTANCE_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: result.sessionExpiresAt,
    });
  }

  return response;
}
