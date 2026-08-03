"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { isValidTimeZone, PLATFORM_FEATURE_KEYS, validateGeneralSettings } from "@/lib/platformSettings";
import { isSchoolSetupEmailProvider } from "@/lib/platformSettings";
import { getSchoolSetupProviderConfiguration, sendSchoolSetupEmail } from "@/lib/email/schoolSetupProviders.server";
import type { SettingsActionState, TestEmailState } from "./actionState";

type RpcResult={status?:string;version?:number};
type RpcError={code?:string|null;message?:string|null;details?:string|null;hint?:string|null};
const isActionMetadataField=(key:string)=>key.startsWith("$ACTION_");
function rejectUnsupportedField(formData:FormData,allowed:ReadonlySet<string>):SettingsActionState|null{
 const rejected=[...formData.keys()].find(key=>!isActionMetadataField(key)&&!allowed.has(key));
 if(!rejected)return null;
 console.warn("Rejected unsupported platform setting field.",{field:rejected});
 return{status:"validation_error",message:"Unsupported platform setting."};
}
function rpcDataShape(data:unknown){return data===null?"null":Array.isArray(data)?"array":typeof data;}
function supportMessage(message:string,correlationId:string){return `${message} Support ID: ${correlationId}`;}
function logEmailDeliveryRpc(data:unknown,error:RpcError|null,correlationId:string){
 const result=data&&typeof data==="object"&&!Array.isArray(data)?data as RpcResult:null;
 console.info("Email delivery settings RPC response.",{dataShape:rpcDataShape(data),status:result?.status??null,version:result?.version??null,errorCode:error?.code??null,errorMessage:error?.message??null,errorDetail:error?.details??null,errorHint:error?.hint??null,correlationId});
}

export async function saveGeneralSettings(_state:SettingsActionState,formData:FormData):Promise<SettingsActionState>{
 const {supabase}=await requireSuperAdminAccess();
 const unsupported=rejectUnsupportedField(formData,new Set(["support_email","default_sender_name","support_website_url","support_phone","version"]));if(unsupported)return unsupported;
 const values={support_email:String(formData.get("support_email")||""),default_sender_name:String(formData.get("default_sender_name")||""),support_website_url:String(formData.get("support_website_url")||""),support_phone:String(formData.get("support_phone")||"")};
 const validation=validateGeneralSettings(values); if(validation)return{status:"validation_error",message:validation};
 const version=Number(formData.get("version")); if(!Number.isSafeInteger(version)||version<1)return{status:"validation_error",message:"Reload settings and try again."};
 const {data,error}=await supabase.rpc("update_platform_settings",{p_section:"general",p_expected_version:version,p_values:values});const result=data as RpcResult|null;
 if(error||!result)return{status:"server_error",message:"Sundial could not save platform settings."};
 if(result.status==="stale")return{status:"stale",message:"These settings changed elsewhere. Reload the current values before saving."};
 if(result.status!=="success")return{status:"server_error",message:"Sundial could not save platform settings."};
 revalidatePath("/admin/dashboard/settings"); return{status:"success",message:"General settings saved.",version:result.version};
}

export async function saveNewSchoolDefaults(_state:SettingsActionState,formData:FormData):Promise<SettingsActionState>{
 const {supabase}=await requireSuperAdminAccess(); const timezone=String(formData.get("default_timezone")||""); const appearance=String(formData.get("default_appearance")||"");
 const unsupported=rejectUnsupportedField(formData,new Set(["default_timezone","default_appearance","version","feature_key",...PLATFORM_FEATURE_KEYS.map(key=>`feature_${key}`)]));if(unsupported)return unsupported;
 if(!isValidTimeZone(timezone))return{status:"validation_error",message:"Choose a valid IANA timezone."}; if(!["light","dark","system"].includes(appearance))return{status:"validation_error",message:"Choose a valid appearance."};
 const submittedKeys=formData.getAll("feature_key").map(String); if(submittedKeys.some(k=>!PLATFORM_FEATURE_KEYS.includes(k as never)))return{status:"validation_error",message:"Unknown feature setting submitted."};
 const features=Object.fromEntries(PLATFORM_FEATURE_KEYS.map(key=>[key,formData.get(`feature_${key}`)==="on"])); const version=Number(formData.get("version"));
 const {data,error}=await supabase.rpc("update_platform_settings",{p_section:"new_school_defaults",p_expected_version:version,p_values:{default_timezone:timezone,default_appearance:appearance,features}});const result=data as RpcResult|null;
 if(error||!result)return{status:"server_error",message:"Sundial could not save new-school defaults."}; if(result.status==="stale")return{status:"stale",message:"These settings changed elsewhere. Reload before saving."}; if(result.status!=="success")return{status:"server_error",message:"Sundial could not save new-school defaults."};
 revalidatePath("/admin/dashboard/settings"); return{status:"success",message:"New-school defaults saved. Existing schools were not changed.",version:result.version};
}

export async function saveEmailDeliverySettings(_state:SettingsActionState,formData:FormData):Promise<SettingsActionState>{
 const {supabase}=await requireSuperAdminAccess();
 const unsupported=rejectUnsupportedField(formData,new Set(["school_setup_email_provider","version"]));if(unsupported)return unsupported;
 const provider=String(formData.get("school_setup_email_provider")||"");if(!isSchoolSetupEmailProvider(provider))return{status:"validation_error",message:"Choose an approved email provider."};
 const version=Number(formData.get("version"));if(!Number.isSafeInteger(version)||version<1)return{status:"validation_error",message:"Reload settings and try again."};
 const correlationId=crypto.randomUUID();
 try {
  const configuration=getSchoolSetupProviderConfiguration(provider);if(!configuration.configured)return{status:"validation_error",message:`${provider==="resend"?"Resend":"Google Workspace"} is not configured. Missing server configuration: ${configuration.missing.join(", ")}.`};
  const {data,error}=await supabase.rpc("update_platform_settings",{p_section:"email_delivery",p_expected_version:version,p_values:{school_setup_email_provider:provider,correlation_id:correlationId}});const result=data as RpcResult|null;
  logEmailDeliveryRpc(data,error,correlationId);
  if(error||!result)return{status:"server_error",message:supportMessage("Sundial could not save email delivery settings. Try again.",correlationId)};
  if(result.status==="stale")return{status:"stale",message:supportMessage("These settings changed elsewhere. Reload before saving.",correlationId)};
  if(result.status!=="success")return{status:"server_error",message:supportMessage("Sundial could not save email delivery settings. Try again.",correlationId)};
  revalidatePath("/admin/dashboard/settings");return{status:"success",message:`Future setup invitations will use ${provider==="resend"?"Resend":"Google Workspace"}.`,version:result.version};
 } catch(error) {
  console.error("Email delivery settings RPC threw.",{dataShape:"unavailable",status:null,version:null,errorCode:null,errorMessage:error instanceof Error?error.message:"Unknown RPC exception",errorDetail:null,errorHint:null,correlationId});
  return{status:"server_error",message:supportMessage("Sundial could not save email delivery settings. Try again.",correlationId)};
 }
}

export async function sendTestSchoolSetupEmail(_state:TestEmailState,formData:FormData):Promise<TestEmailState>{
 await requireSuperAdminAccess();const provider=String(formData.get("provider")||""),recipient=String(formData.get("recipient")||"").trim().toLowerCase();
 if(!isSchoolSetupEmailProvider(provider))return{status:"validation_error",message:"Choose an approved provider."};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||recipient.length>254)return{status:"validation_error",message:"Enter a valid test recipient email."};
 const result=await sendSchoolSetupEmail(provider,{recipient,subject:"Sundial school setup email test",text:`This is a test of the ${provider} school setup email provider.`,html:`<p>This is a test of the <strong>${provider==="resend"?"Resend":"Google Workspace"}</strong> school setup email provider.</p>`,idempotencyKey:`school-setup-test-${crypto.randomUUID()}`,metadata:{kind:"settings_test"}});
 return result.success?{status:"success",message:`Test email sent through ${provider==="resend"?"Resend":"Google Workspace"}.`,providerMessageId:result.providerMessageId??undefined}:{status:"server_error",message:result.errorMessage||"The test email could not be sent."};
}
