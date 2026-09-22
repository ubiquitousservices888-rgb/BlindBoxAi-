import { NextResponse } from "next/server";
import { assertOwnerCode } from "../../../../lib/evidence";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const ENDPOINT="https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/mislisting-scanner-ingest";
const HEADERS={"Cache-Control":"private, no-store, max-age=0",Vary:"Authorization"};

export async function GET(request){
  const auth=request.headers.get("authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  try{assertOwnerCode(token);}catch{return NextResponse.json({error:"Unauthorized"},{status:401,headers:HEADERS});}
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{Authorization:auth,"Content-Type":"application/json"},
    body:JSON.stringify({action:"latest"}),
    cache:"no-store"
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) return NextResponse.json({error:body?.error||"Scanner unavailable"},{status:response.status,headers:HEADERS});
  return NextResponse.json({flags:Array.isArray(body.flags)?body.flags:[]},{headers:HEADERS});
}
