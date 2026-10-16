import test from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURE } from "../lib/video-pipeline.mjs";
import { scheduleOwnerReviewedVideo, validReviewedSchedule } from "../lib/buffer-review-daily-scheduler.mjs";
const now = new Date("2026-10-16T12:00:00.000Z");
const dueAt = "2026-10-17T14:00:00.000Z";
const researchRunId = "rv-0123456789abcdef";
const videoUrl = "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/approved.mp4";
const caption = `Watch this collector research: https://www.blindboxai.com/?campaign=bb-${researchRunId}&source=youtube\n${DISCLOSURE}`;
const ctx = (patch={}) => ({
  token:"disposable-not-real", organizationId:"test-org", channel:"youtube",
  researchRunId, videoUrl, caption, title:"Owner-reviewed collectible",
  youtubeMadeForKids:false, dueAt, now,
  verifyMediaImpl:async()=>true, probeYoutubeImpl:async()=>({durationSeconds:20,width:720,height:1280}),
  resolveChannelImpl:async()=>({id:"test-channel",service:"youtube",isQueuePaused:false,isDisconnected:false,isLocked:false}),
  findExistingImpl:async()=>null,
  fetchImpl:async (_url,opt) => {
    const {variables} = JSON.parse(opt.body);
    return {ok:true,json:async()=>({data:{createPost:{__typename:"PostActionSuccess",post:{
      id:"post-test",status:"scheduled",text:variables.input.text,channelId:"test-channel",dueAt:variables.input.dueAt,
    }}}})};
  }, ...patch,
});
test("only strictly future UTC slots within Buffer free queue horizon",()=>{
  assert.equal(validReviewedSchedule(dueAt,now),dueAt);
  for (const bad of ["tomorrow","2026-10-16","2026-10-15T14:00:00.000Z","2027-02-01T14:00:00.000Z"]) {
    assert.throws(()=>validReviewedSchedule(bad,now));
  }
});
test("won't enqueue without exact per-video audience decision",async()=>{
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx({youtubeMadeForKids:undefined})),/owner's explicit/);
});
test("won't enqueue unverified captions, run IDs or paused channels",async()=>{
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx({caption:"affiliate link missing"})),/Reviewed caption/);
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx({researchRunId:"invalid"})),/research run/);
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx({resolveChannelImpl:async()=>({
    id:"test-channel",service:"youtube",isQueuePaused:true,
  })})),/destination is not available/);
});
test("duplicate existing scheduled/sent post never causes a new create",async()=>{
  let created=false;
  const outcome=await scheduleOwnerReviewedVideo(ctx({
    findExistingImpl:async()=>({id:"previous",status:"scheduled"}),
    fetchImpl:async()=>{created=true;throw Error("should not create");},
  }));
  assert.equal(created,false);
  assert.deepEqual(outcome,{id:"previous",channel:"youtube",duplicate:true,status:"scheduled",dueAt:null,publicUrl:null});
});
test("automatic scheduling retains exact media, audience, attribution and proof of queued-not-live",async()=>{
  let mutation=null;
  const result=await scheduleOwnerReviewedVideo(ctx({
    fetchImpl:async(_url,opt)=>{
      mutation=JSON.parse(opt.body);
      const x=mutation.variables.input;
      return {ok:true,json:async()=>({data:{createPost:{post:{
        id:"buffer-post",status:"scheduled",dueAt:x.dueAt,channelId:x.channelId,text:x.text,
      }}}})};
    },
  }));
  assert.equal(mutation.variables.input.mode,"customScheduled");
  assert.equal(mutation.variables.input.schedulingType,"automatic");
  assert.equal(mutation.variables.input.metadata.youtube.madeForKids,false);
  assert.equal(mutation.variables.input.assets[0].video.url,videoUrl);
  assert.equal(mutation.variables.input.dueAt,dueAt);
  assert.deepEqual(result,{id:"buffer-post",channel:"youtube",duplicate:false,status:"scheduled",dueAt,publicUrl:null});
});
test("no successful schedule claim when Buffer receipt is ambiguous",async()=>{
  await assert.rejects(()=>scheduleOwnerReviewedVideo(ctx({
    fetchImpl:async()=>({ok:true,json:async()=>({data:{createPost:{post:{
      id:"buffer-post",status:"scheduled",dueAt:null,channelId:"test-channel",text:caption,
    }}}})}),
  })),/exact scheduled receipt/);
});
