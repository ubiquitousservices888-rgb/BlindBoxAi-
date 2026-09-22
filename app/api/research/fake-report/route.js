import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ENDPOINT = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/fake-report-ingest";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function error(message,status=400){
  return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
export async function POST(request){
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("multipart/form-data")) return error("multipart/form-data required",415);
  let form;
  try { form=await request.formData(); } catch { return error("Invalid form data",400); }
  if(String(form.get("type")||"")!=="fake_report") return error("Invalid report type",400);
  const itemQuery=String(form.get("itemQuery")||"").trim().slice(0,160);
  const reportText=String(form.get("reportText")||"").trim().slice(0,1200);
  if(itemQuery.length<2 || reportText.length<8) return error("Item and report details required",400);

  let photo=null;
  const file=form.get("photo");
  if(file && typeof file==="object" && typeof file.arrayBuffer==="function" && file.size>0){
    if(file.size>MAX_IMAGE_BYTES) return error("Image must be 4 MB or smaller",413);
    const mime=String(file.type||"").toLowerCase();
    if(!["image/jpeg","image/png","image/webp"].includes(mime)) return error("Use JPG, PNG, or WebP",400);
    const bytes=Buffer.from(await file.arrayBuffer());
    photo={mime,base64:bytes.toString("base64")};
  }

  const code=String(process.env.EVIDENCE_UPLOAD_CODE||"").trim();
  if(!code) return error("Private report intake unavailable",503);
  const response=await fetch(ENDPOINT,{
    method:"POST",
    headers:{Authorization:`Bearer ${code}`,"Content-Type":"application/json"},
    body:JSON.stringify({type:"fake_report",itemQuery,reportText,photo}),
    cache:"no-store",
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) return error(body?.error||"Unable to save report",response.status||502);
  return NextResponse.json({ok:true,status:body.status},{status:202,headers:{"Cache-Control":"no-store"}});
}
