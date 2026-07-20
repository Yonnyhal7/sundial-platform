import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { PlatformFeatureKey } from "@/lib/platformSettings";

export async function isSchoolFeatureAvailable(schoolId:string,featureKey:PlatformFeatureKey){
 const {data,error}=await createSupabaseServiceRoleClient().from("school_feature_availability").select("enabled").eq("school_id",schoolId).eq("feature_key",featureKey).maybeSingle<{enabled:boolean}>();
 if(error)return true;
 return data?.enabled??true;
}
