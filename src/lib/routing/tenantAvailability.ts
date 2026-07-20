export type TenantAvailability = "available" | "unavailable";

/**
 * Proxy-safe tenant lookup. A failed lookup is deliberately unavailable so a
 * database or configuration problem can never redirect an unverified slug.
 */
export async function getTenantAvailability(
  school: string
): Promise<TenantAvailability> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return "unavailable";

  try {
    const endpoint = new URL("/rest/v1/schools", supabaseUrl);
    endpoint.searchParams.set("select", "id");
    endpoint.searchParams.set("subdomain", `eq.${school.trim().toLowerCase()}`);
    endpoint.searchParams.set("archived_at", "is.null");
    endpoint.searchParams.set("limit", "1");

    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return "unavailable";
    const schools = (await response.json()) as Array<{ id: string }>;
    return schools.length === 1 ? "available" : "unavailable";
  } catch {
    return "unavailable";
  }
}
