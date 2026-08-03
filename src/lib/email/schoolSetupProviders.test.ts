import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {getSchoolSetupProviderConfiguration,SCHOOL_SETUP_SENDER_PROFILES} from "./schoolSetupProviders.server";

describe("school setup provider controls",()=>{
 it("maps each enum to the approved server-side sender",()=>{
  expect(SCHOOL_SETUP_SENDER_PROFILES.google_workspace).toEqual({fromName:"Sundial School Setup",fromEmail:"sundialk12@mrhcodes.com",replyTo:"mrh@mrhcodes.com"});
  expect(SCHOOL_SETUP_SENDER_PROFILES.resend).toEqual({fromName:"Sundial School Setup",fromEmail:"setup@sundialk12.com",replyTo:"mrh@mrhcodes.com"});
 });
 it("reports missing Google OAuth credentials without exposing values",()=>{
  expect(getSchoolSetupProviderConfiguration("google_workspace",{})).toEqual({configured:false,missing:["GOOGLE_WORKSPACE_CLIENT_ID","GOOGLE_WORKSPACE_CLIENT_SECRET","GOOGLE_WORKSPACE_REFRESH_TOKEN"]});
 });
 it("requires the Resend key and explicit sender-domain verification",()=>{
  expect(getSchoolSetupProviderConfiguration("resend",{RESEND_API_KEY:"secret",RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED:"false"})).toEqual({configured:false,missing:["RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED"]});
  expect(getSchoolSetupProviderConfiguration("resend",{RESEND_API_KEY:"secret",RESEND_SUNDIAL_SETUP_DOMAIN_VERIFIED:"true"})).toEqual({configured:true,missing:[]});
 });
});
