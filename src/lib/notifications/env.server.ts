import "server-only";

export function getPushEnvironment() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Push notification environment is not configured");
  }
  if (!/^mailto:|^https:/.test(subject)) {
    throw new Error("VAPID_SUBJECT must be a mailto: or https: URL");
  }
  return { publicKey, privateKey, subject };
}

export function requireCronAuthorization(header: string | null) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && header === `Bearer ${secret}`);
}
