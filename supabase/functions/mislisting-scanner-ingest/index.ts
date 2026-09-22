import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const REPO="ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW=`${REPO}/.github/workflows/mislisting-scanner.yml@refs/heads/main`;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const AUDIENCE="blindboxai-mislisting-scanner";
const TTL_MS=6*60*60*1000;

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
}
function clean(v:unknown,max=300){return String(v??"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);}
async function githubAuth(req:Request){
  try{
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const {payload}=await jwtVerify(token,JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
    if(payload.repository!==REPO||payload.ref!=="refs/heads/main"||payload.workflow_ref!==WORKFLOW||!["schedule","workflow_dispatch"].includes(String(payload.event_name||""))) return null;
    return payload;
  }catch{return null;}
}
async function ownerAuth(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer ")) return false;
  try{
    const response=await fetch("https://www.blindboxai.com/api/owner/control-auth",{method:"POST",headers:{Authorization:auth}});
    return response.ok;
  }catch{return false;}
}
async function purgeExpired(){ await db.from("mislisting_flags").delete().lt("expires_at",new Date().toISOString()); }

async function ingest(req:Request,body:any){
  const auth=await githubAuth(req);
  if(!auth) return json({error:"GitHub OIDC authorization required"},403);
  const browseCalls=Number(body?.browseCalls);
  const plannedCalls=Number(body?.plannedCalls);
  if(!Number.isInteger(browseCalls)||browseCalls<0||browseCalls>500||!Number.isInteger(plannedCalls)||plannedCalls<0||plannedCalls>500) return json({error:"Call budget invalid"},400);
  const scannedAt=new Date(String(body?.scannedAt||""));
  if(!Number.isFinite(scannedAt.getTime())) return json({error:"Scan timestamp invalid"},400);
  const flags=Array.isArray(body?.flags)?body.flags.slice(0,500):[];
  await purgeExpired();
  const expiresAt=new Date(scannedAt.getTime()+TTL_MS).toISOString();
  for(const flag of flags){
    const watchItemId=clean(flag?.watchItemId,120);
    const listingId=clean(flag?.listingId,180);
    const title=clean(flag?.title,300);
    const reason=clean(flag?.reason,200);
    const price=flag?.price===null||flag?.price===undefined?null:Number(flag.price);
    const currency=clean(flag?.currency,8)||"USD";
    if(!watchItemId||!listingId||!title||!reason.startsWith("identifier_mismatch:")) continue;
    const {data:existing}=await db.from("mislisting_flags").select("first_seen").eq("watch_item_id",watchItemId).eq("listing_id",listingId).maybeSingle();
    await db.from("mislisting_flags").upsert({
      watch_item_id:watchItemId,listing_id:listingId,title,
      price:Number.isFinite(price)?price:null,currency,reason,
      first_seen:existing?.first_seen||scannedAt.toISOString(),
      last_seen:scannedAt.toISOString(),expires_at:expiresAt
    },{onConflict:"watch_item_id,listing_id"});
  }
  const {error}=await db.from("mislisting_scan_runs").insert({
    scanned_at:scannedAt.toISOString(),browse_calls:browseCalls,flag_count:flags.length,
    github_run_id:clean(auth.run_id,80)||null,
    commit_sha:/^[a-f0-9]{40}$/.test(clean(auth.sha,40))?clean(auth.sha,40):null
  });
  if(error) return json({error:"Scan run persistence failed"},500);
  return json({ok:true,storedFlags:flags.length,expiresAt});
}
async function latest(req:Request){
  if(!await ownerAuth(req)) return json({error:"Unauthorized"},401);
  await purgeExpired();
  const {data,error}=await db.from("mislisting_flags")
    .select("watch_item_id,listing_id,title,price,currency,reason,first_seen,last_seen,expires_at")
    .gt("expires_at",new Date().toISOString()).order("last_seen",{ascending:false}).limit(100);
  if(error) return json({error:"Flag lookup failed"},500);
  return json({ok:true,flags:data||[]});
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  let body:any; try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  if(body?.action==="latest") return latest(req);
  if(body?.action==="ingest") return ingest(req,body);
  return json({error:"Unknown action"},400);
});
