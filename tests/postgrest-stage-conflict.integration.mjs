import test from "node:test";
import assert from "node:assert/strict";

// Requires only a disposable local PostgREST server and PostgreSQL table.
// This is actual PostgREST INSERT ... ON CONFLICT DO NOTHING behavior,
// not an in-memory fake and never touches BlindBoxAI production.
const root = process.env.DISPOSABLE_POSTGREST_URL || "http://127.0.0.1:3000";
async function request(method, path, body, prefer) {
  const response = await fetch(root+path,{
    method,
    headers:{
      "content-type":"application/json",
      ...(prefer?{prefer}:{}),
    },
    ...(body === undefined?{}:{body:JSON.stringify(body)}),
  });
  const text = await response.text();
  if(!response.ok) throw new Error("disposable PostgREST status "+response.status+" "+text.slice(0,500));
  return text ? JSON.parse(text) : null;
}
const id="rv-0000000000000001";
test("PostgREST conflict-ignore preserves owner approval, title and media URL",async()=>{
  const initial={research_run_id:id,status:"ready_for_review",title:"Original owner-reviewed title",video_url:"https://example.test/canonical.mp4"};
  const newInsert=await request("POST","/review_video_queue?on_conflict=research_run_id",[initial],"resolution=ignore-duplicates,return=representation");
  assert.equal(newInsert.length,1);
  await request("PATCH","/review_video_queue?research_run_id=eq."+id,{status:"approved"},"return=representation");
  const retry={...initial,status:"ready_for_review",title:"Malicious or stale changed title",video_url:"https://example.test/swapped.mp4"};
  const conflicted=await request("POST","/review_video_queue?on_conflict=research_run_id",[retry],"resolution=ignore-duplicates,return=representation");
  assert.deepEqual(conflicted,[],"PostgREST must not return an inserted row after ignored conflict");
  const rows=await request("GET","/review_video_queue?research_run_id=eq."+id);
  assert.equal(rows.length,1);
  assert.equal(rows[0].status,"approved");
  assert.equal(rows[0].title,initial.title);
  assert.equal(rows[0].video_url,initial.video_url);
});
test("PostgREST preserves rejected records against restaging",async()=>{
  const rejected="rv-0000000000000002";
  const base={research_run_id:rejected,status:"rejected",title:"Owner rejected video",video_url:"https://example.test/rejected.mp4"};
  await request("POST","/review_video_queue?on_conflict=research_run_id",[base],"resolution=ignore-duplicates,return=representation");
  const duplicate=await request("POST","/review_video_queue?on_conflict=research_run_id",[{...base,status:"ready_for_review"}],"resolution=ignore-duplicates,return=representation");
  assert.deepEqual(duplicate,[]);
  const [stored]=await request("GET","/review_video_queue?research_run_id=eq."+rejected);
  assert.equal(stored.status,"rejected");
});
