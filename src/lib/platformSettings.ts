export const PLATFORM_FEATURE_KEYS = ["public_website","pwa","kiosk","ai_calendar_import","guided_calendar_setup","announcements","events","athletics","resources","offline_mode"] as const;
export type PlatformFeatureKey = typeof PLATFORM_FEATURE_KEYS[number];
export const FEATURE_LABELS: Record<PlatformFeatureKey,string> = {public_website:"Public website",pwa:"PWA",kiosk:"Kiosk",ai_calendar_import:"AI calendar import",guided_calendar_setup:"Guided calendar setup",announcements:"Announcements",events:"Events",athletics:"Athletics",resources:"Resources",offline_mode:"Offline mode"};
export type PlatformSettingsRow = {support_email:string;default_sender_name:string;support_website_url:string|null;support_phone:string|null;default_timezone:string;default_appearance:"light"|"dark"|"system";version:number;updated_at:string;updated_by:string|null};

export function validateGeneralSettings(input: Record<string, unknown>) {
  const allowed = new Set(["support_email","default_sender_name","support_website_url","support_phone"]);
  if (Object.keys(input).some((key)=>!allowed.has(key))) return "Unknown setting submitted.";
  const email=String(input.support_email||"").trim().toLowerCase(), sender=String(input.default_sender_name||"").trim(), website=String(input.support_website_url||"").trim(), phone=String(input.support_phone||"").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return "Enter a valid support email.";
  if (!sender || sender.length>80) return "Sender name must be 1–80 characters.";
  if (website.length>300) return "Support website must be 300 characters or fewer.";
  if (website) { try { const url=new URL(website); if(!["http:","https:"].includes(url.protocol)) return "Enter a valid support website URL."; } catch { return "Enter a valid support website URL."; } }
  if (phone.length>40) return "Support phone must be 40 characters or fewer.";
  return null;
}

export function isValidTimeZone(value:string) { try { new Intl.DateTimeFormat("en-US",{timeZone:value}).format(); return value.length<=100; } catch { return false; } }
