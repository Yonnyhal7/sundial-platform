import "server-only";
export type IntegrationStatus = {name:string;status:"Configured"|"Missing"|"Invalid configuration"|"Not enabled";detail:string;variables?:string[]};
const exists=(name:string)=>Boolean(process.env[name]?.trim());
const urlStatus=(name:string)=>{if(!exists(name))return "Missing" as const;try{const u=new URL(process.env[name]!);return ["http:","https:"].includes(u.protocol)?"Configured" as const:"Invalid configuration" as const;}catch{return "Invalid configuration" as const;}};
export function getIntegrationHealth():IntegrationStatus[]{
 const supabase=exists("NEXT_PUBLIC_SUPABASE_URL")&&exists("NEXT_PUBLIC_SUPABASE_ANON_KEY")?"Configured":"Missing";
 const emailMode=process.env.SUNDIAL_EMAIL_MODE?.trim();
 const resend=!emailMode||emailMode==="disabled"?"Not enabled":exists("RESEND_API_KEY")&&exists("SUNDIAL_FROM_EMAIL")?"Configured":"Missing";
 const openai=exists("OPENAI_API_KEY")?"Configured":"Missing";
 const admin=urlStatus("SUNDIAL_ADMIN_URL");
 const domain=exists("NEXT_PUBLIC_ROOT_DOMAIN")?"Configured":"Missing";
 return [
  {name:"Supabase",status:supabase,detail:"Authentication and application data. Local configuration only; provider connectivity is not live-verified.",variables:supabase==="Missing"?["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY"]:undefined},
  {name:"Resend",status:resend,detail:"Transactional setup and account email. Local configuration only.",variables:resend==="Missing"?["SUNDIAL_EMAIL_MODE","SUNDIAL_FROM_EMAIL"]:undefined},
  {name:"OpenAI",status:openai,detail:"AI-assisted calendar import. Local configuration only.",variables:openai==="Missing"?["OPENAI_API_KEY"]:undefined},
  {name:"Sundial Admin URL",status:admin,detail:"Canonical administration and recovery links.",variables:admin!=="Configured"?["SUNDIAL_ADMIN_URL"]:undefined},
  {name:"Public/base domain",status:domain,detail:"Tenant-aware public routing.",variables:domain==="Missing"?["NEXT_PUBLIC_ROOT_DOMAIN"]:undefined},
  {name:"Password recovery",status:admin==="Configured"&&supabase==="Configured"?"Configured":"Missing",detail:"Requires Supabase authentication plus the canonical admin recovery redirect.",variables:admin!=="Configured"?["SUNDIAL_ADMIN_URL"]:undefined},
 ];
}
