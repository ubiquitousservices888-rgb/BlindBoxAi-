import assert from "node:assert/strict";
import fs from "node:fs";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import test from "node:test";

import { assertVerifiedPublicPost, waitForVerifiedSentPost } from "../lib/buffer-review-publisher.mjs";
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

test("requires a verified public platform URL and exact linked disclosure text", () => {
  const caption = "Research only. https://www.blindboxai.com/?campaign=test\n#ad BlindBoxAI may earn a commission from qualifying purchases.";
  assert.equal(
    assertVerifiedPublicPost({
      channel: "youtube",
      externalLink: "https://www.youtube.com/watch?v=abc123",
      text: caption,
      expectedCaption: caption,
    }),
    "https://www.youtube.com/watch?v=abc123",
  );
  assert.equal(
    assertVerifiedPublicPost({
      channel: "youtube",
      externalLink: "https://m.youtube.com/watch?v=abc123",
      text: caption,
      expectedCaption: caption,
    }),
    "https://m.youtube.com/watch?v=abc123",
  );
  assert.equal(
    assertVerifiedPublicPost({
      channel: "youtube",
      externalLink: "https://music.youtube.com/watch?v=abc123",
      text: caption,
      expectedCaption: caption,
    }),
    "https://music.youtube.com/watch?v=abc123",
  );
  assert.equal(
    assertVerifiedPublicPost({
      channel: "tiktok",
      externalLink: "https://www.tiktok.com/@blindboxai/video/123",
      text: caption,
      expectedCaption: caption,
    }),
    "https://www.tiktok.com/@blindboxai/video/123",
  );
  assert.equal(
    assertVerifiedPublicPost({
      channel: "twitter",
      externalLink: "https://x.com/blindboxai/status/1837264512345678901",
      text: caption,
      expectedCaption: caption,
    }),
    "https://x.com/blindboxai/status/1837264512345678901",
  );
  assert.equal(
    assertVerifiedPublicPost({
      channel: "twitter",
      externalLink: "https://twitter.com/blindboxai/status/1837264512345678901",
      text: caption,
      expectedCaption: caption,
    }),
    "https://twitter.com/blindboxai/status/1837264512345678901",
  );
  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://example.com/watch?v=abc123",
    text: caption,
    expectedCaption: caption,
  }), /valid public post URL/);
  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://www.youtube.com/watch?v=abc123",
    text: "Research only.",
    expectedCaption: caption,
  }), /does not match/);
});

test("public post verification rejects homepages, text drift, and missing required caption content", () => {
  const caption = "Research only. https://www.blindboxai.com/?campaign=test\n#ad BlindBoxAI may earn a commission from qualifying purchases.";

  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://www.youtube.com/",
    text: caption,
    expectedCaption: caption,
  }), /valid public post URL/);

  assert.throws(() => assertVerifiedPublicPost({
    channel: "tiktok",
    externalLink: "https://www.tiktok.com/",
    text: caption,
    expectedCaption: caption,
  }), /valid public post URL/);

  assert.throws(() => assertVerifiedPublicPost({
    channel: "twitter",
    externalLink: "https://x.com/",
    text: caption,
    expectedCaption: caption,
  }), /valid public post URL/);

  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://www.youtube.com/watch?v=abc123",
    text: `${caption} `,
    expectedCaption: caption,
  }), /does not match/);

  const noSite = `Research only.\n${DISCLOSURE}`;
  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://www.youtube.com/watch?v=abc123",
    text: noSite,
    expectedCaption: noSite,
  }), /missing blindboxai\.com/);

  const noDisclosure = "Research only. https://www.blindboxai.com/?campaign=test";
  assert.throws(() => assertVerifiedPublicPost({
    channel: "youtube",
    externalLink: "https://www.youtube.com/watch?v=abc123",
    text: noDisclosure,
    expectedCaption: noDisclosure,
  }), /missing the affiliate disclosure/);
});

test("public verification retries transient Buffer lookup failures and returns verified evidence", async () => {
  const caption = `Research only. https://www.blindboxai.com/?campaign=test\n${DISCLOSURE}`;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary Buffer outage");
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { posts: {
        edges: [{ node: {
          id: "post-1",
          text: caption,
          status: "sent",
          channelId: "channel-youtube",
          externalLink: "https://www.youtube.com/watch?v=abc123",
          sentAt: "2026-09-22T13:00:00Z",
        } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } }),
    };
  };

  const result = await waitForVerifiedSentPost({
    token: "test-token",
    organizationId: "org-1",
    channelId: "channel-youtube",
    channel: "youtube",
    postId: "post-1",
    expectedCaption: caption,
    fetchImpl,
    attempts: 2,
    delayMs: 0,
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, {
    id: "post-1",
    publicUrl: "https://www.youtube.com/watch?v=abc123",
    status: "sent",
    sentAt: "2026-09-22T13:00:00Z",
  });
});

test("public verification emits PUBLIC_VERIFICATION_PENDING after its bounded window", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { posts: {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    } } }),
  });

  await assert.rejects(
    () => waitForVerifiedSentPost({
      token: "test-token",
      organizationId: "org-1",
      channelId: "channel-youtube",
      channel: "youtube",
      postId: "missing-post",
      expectedCaption: `Research only. https://blindboxai.com\n${DISCLOSURE}`,
      fetchImpl,
      attempts: 2,
      delayMs: 0,
    }),
    (error) => error?.code === "PUBLIC_VERIFICATION_PENDING",
  );
});

test("verification searches the same 45-day window as duplicate detection", () => {
  const source = fs.readFileSync(new URL("../lib/buffer-review-publisher.mjs", import.meta.url), "utf8");
  assert.match(source, /45 \* 86400000/);
});

test("caps one execution to exactly one Buffer post", () => {
  assert.equal(MAX_BUFFER_POSTS_PER_EXECUTION, 1);
  const { selected, deferred } = cappedPublishChannels("youtube,tiktok,twitter");
  assert.deepEqual(selected, ["youtube"]);
  assert.deepEqual(deferred, ["tiktok", "twitter"]);
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
  assert.match(source, /const targetChannels = requestedChannel \? \[requestedChannel\] : configuredChannels/);
  assert.match(source, /const eligibleChannels = targetChannels/);
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

test("channel-specific publishing completes only the requested platform", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const configuredChannels =/);
  assert.match(source, /const targetChannels = requestedChannel \? \[requestedChannel\] : configuredChannels/);
  assert.match(source, /const eligibleChannels = targetChannels/);
  assert.match(source, /const targetChannels = requestedChannel \? \[requestedChannel\] : configuredChannels/);
  assert.match(source, /const eligibleChannels = targetChannels/);
  assert.match(source, /targetChannels,/);
  assert.match(source, /publicUrl: result\.publicUrl/);
  assert.match(source, /PUBLIC_VERIFICATION_PENDING/);
  assert.match(source, /action: "release"/);
  assert.doesNotMatch(source, /youtube,tiktok,twitter/);
  assert.match(source, /youtube,tiktok/);
});

test("queue stores only channel records with verified public URLs", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  assert.match(source, /safePublicUrl\(channel, body\?\.publicUrl\)/);
  assert.match(source, /public_urls/);
  assert.match(source, /action === "release"/);

  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260922141500_review_video_public_urls.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /add column if not exists public_urls jsonb/);
  assert.doesNotMatch(migration, /update\s+public\.review_video_queue[\s\S]*status\s*=\s*['"]approved['"]/i);
  assert.match(migration, /Historical published rows must remain published/);
});

test("queue peek is read-only and separately authorized", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function peek(req");
  const end = source.indexOf("async function claim(req");
  const peek = source.slice(start, end);
  assert.match(peek, /githubAuthorized/);
  assert.match(source, /nextApprovedForChannel/);
  assert.match(source, /claimableStatusFilter\(\)/);
  assert.doesNotMatch(peek, /\.update\(/);
});


test("workflow pins review-video target channels and ignores repo override", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  assert.match(source, /^\s*VIDEO_CHANNELS:\s*youtube,tiktok\s*$/m);
  assert.doesNotMatch(source, /^\s*VIDEO_CHANNELS:.*twitter/m);
  assert.doesNotMatch(source, /vars\.VIDEO_CHANNELS/);
  assert.doesNotMatch(source, /schedule:|cron:/);
});


test("exact review row selector is validated and enforced end to end", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  const publisher = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const queue = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");

  assert.match(workflow, /research_run_id:/);
  assert.match(workflow, /PUBLISH_RESEARCH_RUN_ID:/);
  assert.match(publisher, /PUBLISH_RESEARCH_RUN_ID/);
  assert.match(publisher, /const requestedRunId = String\(process\.env\.PUBLISH_RESEARCH_RUN_ID \?\? ""\);/);
  assert.match(publisher, /\^rv-\[a-f0-9\]\{16\}\$/);
  assert.doesNotMatch(publisher, /PUBLISH_RESEARCH_RUN_ID[^\n]*(?:trim|toLowerCase)/);
  assert.match(publisher, /researchRunId: requestedRunId \|\| undefined/);
  assert.match(queue, /function requestedResearchRunId/);
  assert.match(queue, /const researchRunId = String\(body\?\.researchRunId \?\? ""\);/);
  assert.match(queue, /if \(!\/\^rv-\[a-f0-9\]\{16\}\$\/\.test\(researchRunId\)\) throw new Error\("Invalid researchRunId"\)/);
  assert.doesNotMatch(queue, /researchRunId = .*toLowerCase\(\)/);
  assert.match(queue, /query = query\.eq\("research_run_id", researchRunId\)/);
  assert.match(queue, /nextApprovedForChannel\(channel, researchRunId\)/);
  assert.match(queue, /query\.limit\(researchRunId \? 1 : 100\)/);
  assert.match(queue, /Invalid publish channel/);
  assert.match(queue, /Invalid researchRunId/);
});
