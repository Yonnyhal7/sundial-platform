export type SchoolEmailMode = "disabled" | "override" | "live";

export type SchoolEmailConfig = {
  mode: SchoolEmailMode;
  apiKey: string | null;
  from: string | null;
  replyTo: string | null;
  adminUrl: string;
  overrideTo: string | null;
};

export const SUNDIAL_SETUP_FROM_EMAIL = "Sundial <setup@sundialk12.com>";

type EmailEnvironment = Record<string, string | undefined>;

function required(env: EmailEnvironment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function validEmail(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function validMailbox(value: string) {
  const friendlyMatch = value.match(/^.+\s<([^<>]+)>$/);
  return validEmail(friendlyMatch?.[1] ?? value);
}

export function resolveSchoolEmailConfig(env: EmailEnvironment): SchoolEmailConfig {
  const rawMode = required(env, "SUNDIAL_EMAIL_MODE");
  if (!new Set(["disabled", "override", "live"]).has(rawMode)) {
    throw new Error("SUNDIAL_EMAIL_MODE must be disabled, override, or live.");
  }
  const mode = rawMode as SchoolEmailMode;
  const adminUrl = required(env, "SUNDIAL_ADMIN_URL");
  const isProductionDeployment = env.VERCEL_ENV === "production";

  if (mode === "live" && !isProductionDeployment) {
    throw new Error("Live school email delivery is allowed only in Vercel production.");
  }

  if (mode === "disabled") {
    return {
      mode,
      apiKey: null,
      from: null,
      replyTo: null,
      adminUrl,
      overrideTo: null,
    };
  }

  const apiKey = required(env, "RESEND_API_KEY");
  const from = required(env, "SUNDIAL_FROM_EMAIL");
  const replyTo = required(env, "SUNDIAL_REPLY_TO_EMAIL");
  if (!validMailbox(from)) throw new Error("SUNDIAL_FROM_EMAIL is not a valid mailbox.");
  if (from !== SUNDIAL_SETUP_FROM_EMAIL) {
    throw new Error(`SUNDIAL_FROM_EMAIL must be ${SUNDIAL_SETUP_FROM_EMAIL}.`);
  }
  if (!validEmail(replyTo)) {
    throw new Error("SUNDIAL_REPLY_TO_EMAIL is not a valid email address.");
  }

  const overrideTo = mode === "override" ? required(env, "SUNDIAL_EMAIL_OVERRIDE_TO") : null;
  if (overrideTo && !validEmail(overrideTo)) {
    throw new Error("SUNDIAL_EMAIL_OVERRIDE_TO is not a valid email address.");
  }

  return { mode, apiKey, from, replyTo, adminUrl, overrideTo };
}
