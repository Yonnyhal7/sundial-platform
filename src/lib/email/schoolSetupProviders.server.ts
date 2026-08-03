import "server-only";
import { Resend } from "resend";
import type { SchoolSetupEmailProvider } from "@/lib/platformSettings";

export type SchoolSetupSenderProfile = { fromName: string; fromEmail: string; replyTo: string };
export type ProviderConfiguration = { configured: boolean; missing: string[] };
export type SchoolSetupSendResult = {
  success: boolean; provider: SchoolSetupEmailProvider; providerMessageId: string | null;
  from: string; recipient: string; errorCode: string | null; errorMessage: string | null;
};
export type SchoolSetupEmailInput = { recipient:string;subject:string;html:string;text:string;metadata?:Record<string,string>;idempotencyKey?:string };

export const SCHOOL_SETUP_SENDER_PROFILES: Record<SchoolSetupEmailProvider, SchoolSetupSenderProfile> = {
  google_workspace: { fromName:"Sundial School Setup", fromEmail:"sundialk12@mrhcodes.com", replyTo:"mrh@mrhcodes.com" },
  resend: { fromName:"Sundial School Setup", fromEmail:"setup@sundialk12.com", replyTo:"mrh@mrhcodes.com" },
};

const requiredByProvider: Record<SchoolSetupEmailProvider,string[]> = {
  google_workspace:["GOOGLE_WORKSPACE_CLIENT_ID","GOOGLE_WORKSPACE_CLIENT_SECRET","GOOGLE_WORKSPACE_REFRESH_TOKEN"],
  resend:["RESEND_API_KEY","RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED"],
};
export function getSchoolSetupProviderConfiguration(provider:SchoolSetupEmailProvider,env:Record<string,string|undefined>=process.env):ProviderConfiguration{
  const missing=requiredByProvider[provider].filter(name=>name==="RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED"?env[name]?.trim()!=="true":!env[name]?.trim());
  return {configured:missing.length===0,missing};
}
function mailbox(profile:SchoolSetupSenderProfile){return `${profile.fromName} <${profile.fromEmail}>`;}
function normalizeError(error:unknown){
  if(error instanceof Error && /invalid_grant/i.test(error.message))return{code:"google_invalid_grant",message:"Google Workspace authorization is invalid or expired."};
  return{code:"provider_request_failed",message:"The email provider request failed."};
}
function gmailMessage(input:SchoolSetupEmailInput,profile:SchoolSetupSenderProfile){
  const subject=`=?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`;
  const boundary=`sundial_${crypto.randomUUID()}`;
  const raw=[`From: ${mailbox(profile)}`,`To: ${input.recipient}`,`Reply-To: ${profile.replyTo}`,`Subject: ${subject}`,"MIME-Version: 1.0",`Content-Type: multipart/alternative; boundary=\"${boundary}\"`,"",`--${boundary}`,"Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",Buffer.from(input.text).toString("base64"),`--${boundary}`,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",Buffer.from(input.html).toString("base64"),`--${boundary}--`].join("\r\n");
  return Buffer.from(raw).toString("base64url");
}
async function sendGoogle(input:SchoolSetupEmailInput,profile:SchoolSetupSenderProfile){
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.GOOGLE_WORKSPACE_CLIENT_ID!,client_secret:process.env.GOOGLE_WORKSPACE_CLIENT_SECRET!,refresh_token:process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN!,grant_type:"refresh_token"})});
  const token=await tokenResponse.json() as {access_token?:string;error?:string};
  if(!tokenResponse.ok||!token.access_token)throw new Error(token.error||"google_token_failed");
  const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{authorization:`Bearer ${token.access_token}`,"content-type":"application/json"},body:JSON.stringify({raw:gmailMessage(input,profile)})});
  const result=await response.json() as {id?:string;error?:{status?:string}};
  if(!response.ok||!result.id)return{id:null,errorCode:(result.error?.status||"google_send_failed").toLowerCase(),errorMessage:"Google Workspace rejected the email."};
  return{id:result.id,errorCode:null,errorMessage:null};
}
export async function sendSchoolSetupEmail(provider:SchoolSetupEmailProvider,input:SchoolSetupEmailInput):Promise<SchoolSetupSendResult>{
  const profile=SCHOOL_SETUP_SENDER_PROFILES[provider],from=mailbox(profile),configuration=getSchoolSetupProviderConfiguration(provider);
  if(!configuration.configured)return{success:false,provider,providerMessageId:null,from,recipient:input.recipient,errorCode:"provider_not_configured",errorMessage:`${provider === "resend" ? "Resend" : "Google Workspace"} is not configured.`};
  try{
    if(provider==="resend"){
      const {data,error}=await new Resend(process.env.RESEND_API_KEY!).emails.send({from,to:input.recipient,replyTo:profile.replyTo,subject:input.subject,html:input.html,text:input.text},{idempotencyKey:input.idempotencyKey});
      return{success:Boolean(data?.id)&&!error,provider,providerMessageId:data?.id??null,from,recipient:input.recipient,errorCode:error?.name??null,errorMessage:error?"Resend rejected the email.":null};
    }
    const sent=await sendGoogle(input,profile);
    return{success:Boolean(sent.id),provider,providerMessageId:sent.id,from,recipient:input.recipient,errorCode:sent.errorCode,errorMessage:sent.errorMessage};
  }catch(error){const normalized=normalizeError(error);return{success:false,provider,providerMessageId:null,from,recipient:input.recipient,errorCode:normalized.code,errorMessage:normalized.message};}
}
