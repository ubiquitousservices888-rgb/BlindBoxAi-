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

test("queue publisher exits before OIDC claim or Buffer creation in dry-run mode", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const dryRunGate = source.indexOf("if (dryRun)");
  const oidcClaim = source.indexOf("getGithubOidcToken(REVIEW_OIDC_AUDIENCE)");
  const bufferCreate = source.indexOf("createReviewBufferPublisher({");
  assert.ok(dryRunGate >= 0);
  assert.ok(oidcClaim > dryRunGate);
  assert.ok(bufferCreate > dryRunGate);
  assert.match(source, /assertApprovedReviewVideoUrl\(item\.video_url\)/);
  assert.match(source, /cappedPublishChannels\(remainingChannels\.join\(","\)\)/);
});

test("publisher resumes only deferred channels on later runs", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /published_channels/);
  assert.match(source, /remainingChannels = targetChannels\.filter/);
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
