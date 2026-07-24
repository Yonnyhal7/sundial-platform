"use client";
import {useState} from "react";
export default function CopyLoginUrlButton({url}:{url:string}){const [copied,setCopied]=useState(false);return <button type="button" onClick={async()=>{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500)}} className="text-sm font-bold text-blue-700 dark:text-blue-300">{copied?"Copied":"Copy login URL"}</button>}
