import "server-only";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export type MobileAppSchool = {
  id: string;
  name: string;
  subdomain: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
};

export type MobileAppQuickLink = {
  title: string;
  href: string;
};

type QuickLinkResource = {
  title: string;
  url: string | null;
  file_url: string | null;
};

function createPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const getMobileAppSchool = unstable_cache(
  async (school: string) => {
    const supabase = createPublicSupabaseClient();
    const { data } = await supabase
      .rpc("get_school_by_subdomain", { subdomain_input: school })
      .single<MobileAppSchool>();

    return data || null;
  },
  ["mobile-app-school"],
  {
    revalidate: 300,
  }
);

export async function requireMobileAppSchool(school: string) {
  const schoolData = await getMobileAppSchool(school);

  if (!schoolData) {
    notFound();
  }

  return schoolData;
}

export const getMobileAppQuickLinks = unstable_cache(
  async (school: string, schoolId: string) => {
    const supabase = createPublicSupabaseClient();
    const { data: resources } = await supabase
      .from("resources")
      .select("title, url, file_url")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("title", { ascending: true })
      .limit(8)
      .returns<QuickLinkResource[]>();

    return (
      resources
        ?.map((resource) => ({
          title: resource.title,
          href: resource.url || resource.file_url || `/${school}/app/resources`,
        }))
        .filter((resource): resource is MobileAppQuickLink => Boolean(resource.href)) || []
    );
  },
  ["mobile-app-quick-links"],
  {
    revalidate: 300,
  }
);
