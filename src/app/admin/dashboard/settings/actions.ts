"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { isValidTimeZone, PLATFORM_FEATURE_KEYS, validateGeneralSettings } from "@/lib/platformSettings";

export type SettingsActionState={status:"idle"|"success"|"validation_error"|"stale"|"server_error";message?:string;version?:number};
export const INITIAL_SETTINGS_STATE:SettingsActionState={status:"idle"};
type RpcResult={status?:string;version?:number};

export async function saveGeneralSettings(_state:SettingsActionState,formData:FormData):Promise<SettingsActionState>{
 const {supabase}=await requireSuperAdminAccess();
 const allowed=new Set(["support_email","default_sender_name","support_website_url","support_phone","version"]); if([...formData.keys()].some(key=>!allowed.has(key)))return{status:"validation_error",message:"Unknown setting submitted."};
 const values={support_email:String(formData.get("support_email")||""),default_sender_name:String(formData.get("default_sender_name")||""),support_website_url:String(formData.get("support_website_url")||""),support_phone:String(formData.get("support_phone")||"")};
 const validation=validateGeneralSettings(values); if(validation)return{status:"validation_error",message:validation};
 const version=Number(formData.get("version")); if(!Number.isSafeInteger(version)||version<1)return{status:"validation_error",message:"Reload settings and try again."};
 const {data,error}=await supabase.rpc("update_platform_settings",{p_section:"general",p_expected_version:version,p_values:values}).single<RpcResult>();
 if(error||!data)return{status:"server_error",message:"Sundial could not save platform settings."};
 if(data.status==="stale")return{status:"stale",message:"These settings changed elsewhere. Reload the current values before saving."};
 if(data.status!=="success")return{status:"server_error",message:"Sundial could not save platform settings."};
 revalidatePath("/admin/dashboard/settings"); return{status:"success",message:"General settings saved.",version:data.version};
}

export async function saveNewSchoolDefaults(_state:SettingsActionState,formData:FormData):Promise<SettingsActionState>{
 const {supabase}=await requireSuperAdminAccess(); const timezone=String(formData.get("default_timezone")||""); const appearance=String(formData.get("default_appearance")||"");
 const allowed=new Set(["default_timezone","default_appearance","version","feature_key",...PLATFORM_FEATURE_KEYS.map(key=>`feature_${key}`)]); if([...formData.keys()].some(key=>!allowed.has(key)))return{status:"validation_error",message:"Unknown setting submitted."};
 if(!isValidTimeZone(timezone))return{status:"validation_error",message:"Choose a valid IANA timezone."}; if(!["light","dark","system"].includes(appearance))return{status:"validation_error",message:"Choose a valid appearance."};
 const submittedKeys=formData.getAll("feature_key").map(String); if(submittedKeys.some(k=>!PLATFORM_FEATURE_KEYS.includes(k as never)))return{status:"validation_error",message:"Unknown feature setting submitted."};
 const features=Object.fromEntries(PLATFORM_FEATURE_KEYS.map(key=>[key,formData.get(`feature_${key}`)==="on"])); const version=Number(formData.get("version"));
 const {data,error}=await supabase.rpc("update_platform_settings",{p_section:"new_school_defaults",p_expected_version:version,p_values:{default_timezone:timezone,default_appearance:appearance,features}}).single<RpcResult>();
 if(error||!data)return{status:"server_error",message:"Sundial could not save new-school defaults."}; if(data.status==="stale")return{status:"stale",message:"These settings changed elsewhere. Reload before saving."}; if(data.status!=="success")return{status:"server_error",message:"Sundial could not save new-school defaults."};
 revalidatePath("/admin/dashboard/settings"); return{status:"success",message:"New-school defaults saved. Existing schools were not changed.",version:data.version};
}
