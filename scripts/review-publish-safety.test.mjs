import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  assertApprovedReviewVideoUrl,
  cappedPublishChannels,
  isDryRun,
  MAX_BUFFER_POSTS_PER_EXECUTION,
} from "../lib/review-publish-safety.mjs";

test("allows only BlindBoxAI review-media hosts and MP4 paths", () => {
  assert.doesNotThrow(() => assertApprovedReviewVideoUrl(
    "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/example.mp4",
  ));
  assert.doesNotThrow(() => assertApprovedReviewVideoUrl(
    "https://example.public.blob.vercel-storage.com/media/review/example.mp4",
  ));
  assert.throws(() => assertApprovedReviewVideoUrl("https://evil.example/media/review/example.mp4"), /approved BlindBoxAI media host/);
  assert.throws(() => assertApprovedReviewVideoUrl("https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/other/media/review/example.mp4"), /approved BlindBoxAI media host/);
  assert.throws(() => assertApprovedReviewVideoUrl("http://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/example.mp4"), /HTTPS/);
  assert.throws(() => assertApprovedReviewVideoUrl("https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/example.txt"), /MP4/);
});

test("caps one execution to exactly one Buffer post", () => {
  assert.equal(MAX_BUFFER_POSTS_PER_EXECUTION, 1);
  const { selected, deferred } = cappedPublishChannels("youtube,tiktok");
  assert.deepEqual(selected, ["youtube"]);
  assert.deepEqual(deferred, ["tiktok"]);
});

test("dry-run parsing is explicit", () => {
  assert.equal(isDryRun("true"), true);
  assert.equal(isDryRun("1"), true);
  assert.equal(isDryRun("false"), false);
});

test("queue publisher dry-run uses peek and exits before Buffer creation", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const queueDecision = source.indexOf('action: dryRun ? "peek" : "claim"');
  const dryPreview = source.indexOf("REVIEW_QUEUE_WOULD_PUBLISH_CHANNEL");
  const bufferCreate = source.indexOf("createReviewBufferPublisher({");
  assert.ok(queueDecision >= 0);
  assert.ok(dryPreview > queueDecision);
  assert.ok(bufferCreate > dryPreview);
  assert.match(source, /assertApprovedReviewVideoUrl\(item\.video_url\)/);
  assert.match(source, /cappedPublishChannels\(remainingChannels\.join\(","\)\)/);
  assert.match(source, /PUBLISH_CHANNEL/);
  assert.match(source, /eligibleChannels = requestedChannel \? \[requestedChannel\] : targetChannels/);
});

test("publisher resumes only deferred channels on later runs", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /published_channels/);
  assert.match(source, /remainingChannels = eligibleChannels\.filter/);
  assert.match(source, /action: "record_channel"/);
  assert.match(source, /if \(!recorded\?\.complete\)/);
  assert.doesNotMatch(source, /action: "complete", researchRunId: item\.research_run_id, success: true/);
});

test("queue edge function records one channel and re-approves until all target channels are complete", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  assert.match(source, /action === "record_channel"/);
  assert.match(source, /published_channels/);
  assert.match(source, /buffer_post_ids/);
  assert.match(source, /status: "approved"/);
  assert.match(source, /status: "published"/);
  assert.match(source, /targetChannels\.every/);
});

test("dry-run uses read-only peek and reports the exact next channel without Buffer", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /action: dryRun \? "peek" : "claim"/);
  assert.match(source, /REVIEW_QUEUE_WOULD_PUBLISH_RUN/);
  assert.match(source, /REVIEW_QUEUE_WOULD_PUBLISH_TITLE/);
  assert.match(source, /REVIEW_QUEUE_WOULD_PUBLISH_CHANNEL/);
  const dryExit = source.indexOf("REVIEW_QUEUE_WOULD_PUBLISH_CHANNEL");
  const bufferCreate = source.indexOf("createReviewBufferPublisher({");
  assert.ok(dryExit >= 0 && bufferCreate > dryExit);
});

test("channel-aware queue claim skips rows that already completed the requested channel", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  assert.match(source, /requestedPublishChannel/);
  assert.match(source, /nextApprovedForChannel/);
  assert.match(source, /published_channels/);
  assert.match(source, /includes\(channel\)/);
  assert.match(source, /peek\(req, body\)/);
  assert.match(source, /claim\(req, body\)/);
});

test("channel-specific publishing keeps youtube,tiktok as the completion target", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const targetChannels =/);
  assert.match(source, /const eligibleChannels = requestedChannel \? \[requestedChannel\] : targetChannels/);
  assert.match(source, /targetChannels,/);
});

test("queue peek is read-only and separately authorized", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function peek(req");
  const end = source.indexOf("async function claim(req");
  const peek = source.slice(start, end);
  assert.match(peek, /githubAuthorized/);
  assert.match(source, /nextApprovedForChannel/);
  assert.match(source, /eq\("status", "approved"\)/);
  assert.doesNotMatch(peek, /\.update\(/);
});
