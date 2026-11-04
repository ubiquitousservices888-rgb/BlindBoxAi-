import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPostgrestReviewScheduleStore } from "../lib/postgrest-review-schedule-store.mjs";
import { scheduleOwnerReviewedVideo } from "../lib/buffer-review-daily-scheduler.mjs";
import { DISCLOSURE } from "../lib/video-pipeline.mjs";

// Disposable PostgREST contract for the future durable scheduling backend.
// This test never calls Buffer or production Supabase. It must run against
// the ephemeral schema in disposable-buffer-schedule-claim.yml.
const root = process.env.DISPOSABLE_POSTGREST_URL || "http://127.0.0.1:3000";
const fixture = () => "rv-" + randomBytes(8).toString("hex");
async function api(method, path, data, prefer) {
  const response = await fetch(root + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await response.text();
  assert.equal(response.status >= 200 && response.status < 300, true,
    "disposable PostgREST returned HTTP " + response.status);
  return body ? JSON.parse(body) : null;
}
const keyPath = (id, channel) =>
  "/review_schedule_claims?research_run_id=eq." + id + "&channel=eq." + channel;
const claim = (row) => api("POST",
  "/review_schedule_claims?on_conflict=research_run_id,channel",
  [row], "resolution=ignore-duplicates,return=representation");

test("16 concurrent scheduling attempts yield exactly one durable claim", async (t) => {
  const id = fixture();
  const row = {research_run_id:id, channel:"youtube",channel_id:"test-channel",
    media_url:"https://example.test/owner-reviewed.mp4", status:"claimed"};
  t.after(async () => api("DELETE",keyPath(id,"youtube"),undefined,"return=minimal"));
  const results = await Promise.all(Array.from({length:16}, () => claim(row)));
  assert.equal(results.filter(x => x.length === 1).length,1);
  assert.equal(results.filter(x => x.length === 0).length,15);
  const stored = await api("GET",keyPath(id,"youtube"));
  assert.equal(stored.length,1);
  assert.equal(stored[0].media_url,row.media_url);
  assert.equal(stored[0].status,"claimed");
});

test("ambiguous Buffer response retains claim; retries cannot create a second", async (t) => {
  const id = fixture();
  const row = {research_run_id:id,channel:"tiktok",channel_id:"test-channel",
    media_url:"https://example.test/canonical.mp4",status:"claimed"};
  t.after(async () => api("DELETE",keyPath(id,"tiktok"),undefined,"return=minimal"));
  assert.equal((await claim(row)).length,1);
  assert.deepEqual(await claim({...row,media_url:"https://example.test/swapped.mp4"}),[]);
  const [stored] = await api("GET",keyPath(id,"tiktok"));
  assert.equal(stored.media_url,row.media_url);
  assert.equal(stored.status,"claimed");
  assert.equal(stored.buffer_post_id,null);
});

test("Buffer scheduled receipt is not a verified public-platform receipt", async (t) => {
  const id = fixture();
  const row = {research_run_id:id,channel:"youtube",channel_id:"test-channel",
    media_url:"https://example.test/canonical.mp4",status:"claimed"};
  t.after(async () => {
    await api("DELETE","/review_publication_receipts?research_run_id=eq."+id,
      undefined,"return=minimal");
    await api("DELETE",keyPath(id,"youtube"),undefined,"return=minimal");
  });
  await claim(row);
  const updated = await api("PATCH",keyPath(id,"youtube"),
    {status:"scheduled",buffer_post_id:"disposable-buffer-receipt",
      due_at:"2026-10-18T14:00:00Z"},"return=representation");
  assert.equal(updated.length,1);
  assert.equal(updated[0].status,"scheduled");
  assert.equal(updated[0].buffer_post_id,"disposable-buffer-receipt");
  assert.equal(updated[0].public_url,undefined);
  const published = await api("GET",
    "/review_publication_receipts?research_run_id=eq."+id);
  assert.deepEqual(published,[],
    "scheduled Buffer receipt must not create a confirmed public URL");
});

test("same media can be claimed independently for YouTube and TikTok", async (t) => {
  const id = fixture();
  const media_url="https://example.test/canonical.mp4";
  t.after(async () => {
    for(const channel of ["youtube","tiktok"])
      await api("DELETE",keyPath(id,channel),undefined,"return=minimal");
  });
  const results = await Promise.all(["youtube","tiktok"].map(channel =>
    claim({research_run_id:id,channel,channel_id:"test-channel",media_url,status:"claimed"})));
  assert.deepEqual(results.map(x=>x.length),[1,1]);
});

const testMediaUrl = () =>
  "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/" + randomBytes(8).toString("hex") + ".mp4";
const reviewedContext = (store,videoUrl, fetchImpl) => {
  const researchRunId = "rv-" + createHash("sha256").update(videoUrl).digest("hex").slice(0,16);
  const dueAt="2026-10-17T14:00:00.000Z";
  return {
    token:"disposable-buffer-token",organizationId:"test-org",
    channel:"youtube",researchRunId,videoUrl,
    caption:"Research: https://www.blindboxai.com/?campaign=bb-" + researchRunId + "&source=youtube\n" + DISCLOSURE,
    title:"Owner-reviewed collector clip",youtubeMadeForKids:false,
    dueAt,now:new Date("2026-10-16T12:00:00.000Z"),fetchImpl,
    resolveChannelImpl:async()=>({id:"test-channel",service:"youtube",isQueuePaused:false,isDisconnected:false,isLocked:false}),
    findExistingImpl:async()=>null,
    verifyMediaImpl:async()=>true,probeYoutubeImpl:async()=>({durationSeconds:30,width:720,height:1280}),
    claimScheduleImpl:store.claimScheduleImpl,
    recordScheduledReceiptImpl:store.recordScheduledReceipt,
  };
};
test("real scheduler, PostgREST and database permit only one Buffer create and persist its receipt",async(t)=>{
  const store=createPostgrestReviewScheduleStore({baseUrl:root});
  const videoUrl=testMediaUrl();
  const runId="rv-"+createHash("sha256").update(videoUrl).digest("hex").slice(0,16);
  t.after(async()=>api("DELETE",keyPath(runId,"youtube"),undefined,"return=minimal"));
  let mutations=0;
  const bufferFetch=async(_url,opt)=>{
    mutations++;
    const input=JSON.parse(opt.body).variables.input;
    await new Promise(resolve=>setTimeout(resolve,10));
    return {ok:true,json:async()=>({data:{createPost:{post:{
      id:"disposable-buffer-post",channelId:input.channelId,status:"scheduled",
      dueAt:input.dueAt,text:input.text,
    }}}})};
  };
  const ctx=reviewedContext(store,videoUrl,bufferFetch);
  const attempts=await Promise.allSettled(Array.from({length:12},()=>scheduleOwnerReviewedVideo(ctx)));
  assert.equal(mutations,1,"durable claim must protect the external Buffer mutation");
  assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(attempts.filter(x=>x.status==="rejected").length,11);
  const saved=await store.getClaim({researchRunId:runId,channel:"youtube"});
  assert.equal(saved.channel_id,"test-channel");
  assert.equal(saved.status,"scheduled");
  assert.equal(saved.buffer_post_id,"disposable-buffer-post");
  assert.equal(Date.parse(saved.due_at),Date.parse(ctx.dueAt));
  const result=attempts.find(x=>x.status==="fulfilled").value;
  assert.equal(result.publicUrl,null);
  assert.deepEqual(await api("GET","/review_publication_receipts?research_run_id=eq."+runId),[]);
});
test("ambiguous Buffer outcome retains durable claim and prevents a second create",async(t)=>{
  const store=createPostgrestReviewScheduleStore({baseUrl:root});
  const videoUrl=testMediaUrl();
  const runId="rv-"+createHash("sha256").update(videoUrl).digest("hex").slice(0,16);
  t.after(async()=>api("DELETE",keyPath(runId,"youtube"),undefined,"return=minimal"));
  let mutations=0;
  const bufferFetch=async(_url,opt)=>{
    mutations++;
    const input=JSON.parse(opt.body).variables.input;
    return {ok:true,json:async()=>({data:{createPost:{post:{
      id:"ambiguous",channelId:input.channelId,status:"scheduled",
      dueAt:null,text:input.text,
    }}}})};
  };
  const ctx=reviewedContext(store,videoUrl,bufferFetch);
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx),/exact scheduled receipt/);
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx),/claim not acquired/);
  assert.equal(mutations,1);
  const saved=await store.getClaim({researchRunId:runId,channel:"youtube"});
  assert.equal(saved.status,"claimed");
  assert.equal(saved.buffer_post_id,null);
});
test("credentialed PostgREST requests reject redirects without contacting redirect destination",async(t)=>{
  let canaryHits=0;
  const canary=createServer((_req,res)=>{canaryHits++;res.writeHead(200,{"content-type":"application/json"});res.end("[]");});
  canary.listen(0,"127.0.0.1");await once(canary,"listening");
  const redirector=createServer((_req,res)=>{
    res.writeHead(307,{location:"http://127.0.0.1:"+canary.address().port+"/canary"});
    res.end();
  });
  redirector.listen(0,"127.0.0.1");await once(redirector,"listening");
  t.after(async()=>{await Promise.all([redirector,canary].map(server=>
    new Promise(resolve=>server.close(resolve))));});
  const store=createPostgrestReviewScheduleStore({
    baseUrl:"http://127.0.0.1:"+redirector.address().port,
    apiKey:"disposable-only",bearerToken:"disposable-only",
  });
  await assert.rejects(()=>store.getClaim({researchRunId:fixture(),channel:"youtube"}),/request failed|rejected/);
  assert.equal(canaryHits,0,"redirect must not forward tokens to the destination");
});
