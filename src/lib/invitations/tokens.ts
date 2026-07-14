import { createHash, randomBytes } from "node:crypto";

export const SCHOOL_SETUP_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSchoolSetupInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSchoolSetupInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getSchoolSetupInvitationExpiration(now = new Date()) {
  return new Date(now.getTime() + SCHOOL_SETUP_INVITATION_TTL_MS);
}

export function isPlausibleSchoolSetupInvitationToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
