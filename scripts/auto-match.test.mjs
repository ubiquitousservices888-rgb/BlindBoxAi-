import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ownProductPolicy, bindOwnProductPolicy } from "../lib/review-own-product.mjs";
const current = {research_run_id:"rv-46e2ab7acda58ff9", title:"The fake test field guide", status:"ready_for_review", video_url:"https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/1795749758411-4643.mp4"};
const make = (title, name = "fixture") => {
  const video_url = `https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/${name}.mp4`;
  return { title, status: "ready_for_review", video_url, research_run_id: `rv-${createHash("sha256").update(video_url).digest("hex").slice(0, 16)}` };
};
test("exact existing upload uses the previously selected bundle and both channel receipts", () => {
  assert.equal(current.research_run_id, `rv-${createHash("sha256").update(current.video_url).digest("hex").slice(0, 16)}`);
  const bound = bindOwnProductPolicy({...current,status:"publishing"});
  for (const channel of ["youtube","tiktok"]) {
    const preview = ownProductPolicy.forItem(current,channel);
    assert.equal(new URL(preview.trackedUrl).pathname,"/l/fxloos");
    assert.equal(preview.title,"The Fake-Check Field Guide");
    assert.deepEqual(bound.forReceipt(current.research_run_id,current.video_url,channel),preview);
  }
  assert.throws(()=>bindOwnProductPolicy({...current, title:"Changed"}));
  assert.throws(()=>bindOwnProductPolicy({...current, status:"rejected"}));
});
test("new known title automatically selects exact product; receipt is bound to the same row",()=>{
  for (const [title, slug] of [["The Fake-Check Field Guide","bjfpgf"],["The fake check Field guide","bjfpgf"],["Sports Card Collecting Series","fxloos"]]) {
    const row = make(title);
    const policy = bindOwnProductPolicy({...row,status:"publishing"});
    for (const channel of ["youtube","tiktok"]) {
      const preview = ownProductPolicy.forItem(row,channel);
      assert.equal(new URL(preview.trackedUrl).pathname,`/l/${slug}`);
      assert.deepEqual(policy.forReceipt(row.research_run_id,row.video_url,channel),preview);
      assert.equal(preview.caption.match(/https:\/\/\S+/g).length,1);
      assert.doesNotMatch(preview.caption,/affiliate|ebay|amazon/i);
    }
    assert.throws(()=>policy.forReceipt(row.research_run_id,row.video_url.replace("fixture","swap"),"youtube"));
    assert.throws(()=>policy.forItem({...row,title:"Changed"},"youtube"));
  }
});
test("unknown, conflicting and invalid source data cannot select an owned product",()=>{
  for (const title of ["Fake check", "Fake-Check Field Guide and Sports Card Collecting Series", "https://evil.example", "The fake test field guide"]) {
    const row=make(title);
    assert.equal(ownProductPolicy.forItem(row,"youtube"),null);
    assert.equal(bindOwnProductPolicy(row).forReceipt(row.research_run_id,row.video_url,"youtube"),null);
  }
  const row=make("The Fake-Check Field Guide");
  assert.throws(()=>ownProductPolicy.forItem({...row,research_run_id:"rv-1111111111111111"},"youtube"));
  assert.throws(()=>bindOwnProductPolicy({...row,status:"rejected"}));
  assert.throws(()=>ownProductPolicy.forItem({...row,video_url:"https://evil.example/video.mp4"},"youtube"));
});
