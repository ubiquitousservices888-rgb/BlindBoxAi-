import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const BUCKET = "blindboxai-authenticity-reports";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json", "cache-control":"no-store", "x-content-type-options":"nosniff" },
  });
}
function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
async function authorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const response = await fetch("https://www.blindboxai.com/api/owner/storage-auth", {
      method:"POST",
      headers:{ Authorization:auth },
    });
    return response.ok;
  } catch { return false; }
}
function decodeBase64(value:string) {
  const raw = atob(value);
  return Uint8Array.from(raw, (c)=>c.charCodeAt(0));
}
Deno.serve(async (req:Request)=>{
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  if (!await authorized(req)) return json({error:"Unauthorized"},401);
  let body:any;
  try { body=await req.json(); } catch { return json({error:"Invalid JSON"},400); }
  if (body?.type !== "fake_report") return json({error:"Invalid report type"},400);
  const itemQuery=clean(body?.itemQuery,160);
  const reportText=clean(body?.reportText,1200);
  if (itemQuery.length < 2 || reportText.length < 8) return json({error:"Item and report details required"},400);

  const id=crypto.randomUUID();
  let photoPath:string|null=null;
  const photo=body?.photo;
  if (photo) {
    const mime=clean(photo?.mime,80).toLowerCase();
    const ext=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":mime==="image/webp"?"webp":"";
    if (!ext) return json({error:"Unsupported image type"},400);
    const base64=String(photo?.base64||"");
    if (!base64 || base64.length > 5_700_000) return json({error:"Image too large"},413);
    const bytes=decodeBase64(base64);
    if (bytes.byteLength > 4*1024*1024) return json({error:"Image too large"},413);
    photoPath=`fake-reports/${id}/evidence.${ext}`;
    const { error:uploadError }=await db.storage.from(BUCKET).upload(photoPath,bytes,{contentType:mime,upsert:false});
    if (uploadError) return json({error:"Private photo storage failed"},500);
  }

  const { error }=await db.from("authenticity_reports").insert({
    id,
    item_query:itemQuery,
    report_text:reportText,
    photo_path:photoPath,
    status:"pending_owner_review",
    authenticity_tier:null,
    source:"public_fake_report",
  });
  if (error) {
    if (photoPath) await db.storage.from(BUCKET).remove([photoPath]);
    return json({error:"Report storage failed"},500);
  }
  return json({ok:true,id,status:"pending_owner_review"},202);
});
