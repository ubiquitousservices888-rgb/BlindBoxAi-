import assert from "node:assert/strict";
import fs from "node:fs";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import test from "node:test";

import { assertVerifiedPublicPost, REVIEW_YOUTUBE_CHANNEL_ID, resolveReviewBufferChannel, waitForVerifiedSentPost } from "../lib/buffer-review-publisher.mjs";
import { assertYoutubeShortsMetadata } from "../lib/review-shorts-eligibility.mjs";
import { probeYoutubeShortsMedia } from "../lib/review-shorts-preflight.mjs";
import { normalizeReviewRunId } from "../lib/review-run-id.mjs";
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

test("Shorts preflight checks the actual probed duration and dimensions", async () => {
  assert.deepEqual(assertYoutubeShortsMetadata({ durationSeconds: 67, width: 720, height: 1280 }), {
    durationSeconds: 67, width: 720, height: 1280,
  });
  assert.doesNotThrow(() => assertYoutubeShortsMetadata({ durationSeconds: 180, width: 1080, height: 1080 }));
  assert.throws(() => assertYoutubeShortsMetadata({ durationSeconds: 613, width: 1280, height: 720 }), /three-minute/);
  assert.throws(() => assertYoutubeShortsMetadata({ durationSeconds: 67, width: 1280, height: 720 }), /square or 9:16/);
  assert.throws(() => assertYoutubeShortsMetadata({ durationSeconds: NaN, width: 720, height: 1280 }), /measured duration/);
  assert.throws(() => assertYoutubeShortsMetadata({ durationSeconds: 0.05, width: 720, height: 1280 }), /at least one second/);
  assert.throws(() => assertYoutubeShortsMetadata({ durationSeconds: 10, width: 4, height: 7 }), /240 pixels/);
  await assert.rejects(() => probeYoutubeShortsMedia("unused", async () => ({
    streams: [{ codec_type: "video", width: 1280, height: 720 }], format: { duration: "613.5" },
  })), /three-minute/);
  await assert.rejects(() => probeYoutubeShortsMedia("unused", async () => ({ streams: [], format: {} })), /no video stream/);
  assert.deepEqual(await probeYoutubeShortsMedia("unused", async () => ({
    streams: [
      { codec_type: "video", width: 1000, height: 1000, disposition: { attached_pic: 1 } },
      { codec_type: "video", width: 1920, height: 1080, disposition: { attached_pic: 0, default: 1 }, side_data_list: [{ rotation: -90 }] },
    ],
    format: { duration: "12.5" },
  })), { durationSeconds: 12.5, width: 1080, height: 1920 });
  assert.deepEqual(await probeYoutubeShortsMedia("unused", async () => ({
    streams: [{ codec_type: "video", width: 1920, height: 1080, tags: { rotate: "90" } }],
    format: { duration: "12.5" },
  })), { durationSeconds: 12.5, width: 1080, height: 1920 });
});

test("the review publisher refuses a different Buffer YouTube destination", async () => {
  const fetchImpl = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const data = query.includes("query Organizations")
      ? { account: { organizations: [{ id: "org-test", name: "Public" }] } }
      : { channels: [{ id: "buffer-channel", service: "youtube", serviceId: "UC-wrong-destination", isLocked: false, isDisconnected: false, isQueuePaused: false }] };
    return { ok: true, json: async () => ({ data }) };
  };
  await assert.rejects(() => resolveReviewBufferChannel({
    token: "disposable-token", organizationId: "org-test", channel: "youtube", fetchImpl,
  }), /approved destination, found 0/);
});

test("review share-now resolver accepts the exact YouTube destination when only its schedule queue is paused", async () => {
  const fetchImpl = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    const data = query.includes("query Organizations")
      ? { account: { organizations: [{ id: "org-test", name: "Public" }] } }
      : { channels: [{
          id: "buffer-youtube",
          service: "youtube",
          serviceId: REVIEW_YOUTUBE_CHANNEL_ID,
          isLocked: false,
          isDisconnected: false,
          isQueuePaused: true,
        }] };
    return { ok: true, json: async () => ({ data }) };
  };

  const target = await resolveReviewBufferChannel({
    token: "disposable-token",
    organizationId: "org-test",
    channel: "youtube",
    fetchImpl,
  });
  assert.equal(target.id, "buffer-youtube");
  assert.equal(target.serviceId, REVIEW_YOUTUBE_CHANNEL_ID);
  assert.equal(target.isQueuePaused, true);
});

test("queue publisher dry-run uses peek and exits before Buffer creation", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const queueDecision = source.indexOf('action: dryRun ? "peek" : "claim"');
  const dryPreview = source.indexOf("REVIEW_QUEUE_WOULD_PUBLISH_CHANNEL");
  const bufferDestination = source.indexOf("REVIEW_QUEUE_BUFFER_DESTINATION");
  const bufferResolve = source.indexOf("const target = await resolveReviewBufferChannel({");
  const bufferCreate = source.indexOf("createReviewBufferPublisher({");
  assert.ok(queueDecision >= 0);
  assert.ok(dryPreview > queueDecision);
  assert.ok(bufferResolve > queueDecision && bufferDestination > bufferResolve && dryPreview > bufferDestination);
  assert.ok(bufferCreate > dryPreview);
  assert.match(source, /assertApprovedReviewVideoUrl\(item\.video_url\)/);
  assert.match(source, /probeYoutubeShortsMedia\(safeVideoUrl\)/);
  assert.match(source, /resolveReviewBufferChannel/);
  assert.match(source, /cappedPublishChannels\(remainingChannels\.join\(","\)\)/);
  assert.match(source, /PUBLISH_CHANNEL/);
  assert.match(source, /const configuredChannels =/);
  assert.match(source, /Requested channel is not in VIDEO_CHANNELS/);
  assert.match(source, /const targetChannels = configuredChannels/);
  assert.match(source, /const eligibleChannels = requestedChannel \? \[requestedChannel\] : targetChannels/);
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

test("channel-specific publishing runs one requested platform while preserving the full completion target", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const configuredChannels =/);
  assert.match(source, /const targetChannels = configuredChannels/);
  assert.match(source, /const eligibleChannels = requestedChannel \? \[requestedChannel\] : targetChannels/);
  assert.match(source, /targetChannels,/);
  assert.match(source, /const feedChannels =/);
  assert.match(source, /channels: feedChannels/);
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


test("workflow requires explicit channel and exact review row inputs", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  const channelStart = source.indexOf("      publish_channel:");
  const runStart = source.indexOf("      research_run_id:");
  const audienceStart = source.indexOf("      youtube_audience:");
  assert.ok(channelStart >= 0 && runStart > channelStart && audienceStart > runStart);

  const channelBlock = source.slice(channelStart, runStart);
  assert.match(channelBlock, /required: true/);
  assert.match(channelBlock, /type: choice/);
  assert.doesNotMatch(channelBlock, /default\s*:/);
  const optionsBlock = channelBlock.slice(channelBlock.indexOf("options:"));
  assert.deepEqual(
    [...optionsBlock.matchAll(/^[ \t]+- ([a-z0-9_-]+)$/gm)].map((match) => match[1]),
    ["youtube", "tiktok"],
  );

  const runBlock = source.slice(runStart, audienceStart);
  assert.match(runBlock, /required: true/);
  assert.match(runBlock, /type: string/);
  assert.doesNotMatch(runBlock, /default\s*:/);
  assert.match(source, /PUBLISH_CHANNEL: \$\{\{ inputs\.publish_channel \}\}/);
});

test("workflow pins review-video target channels and ignores repo override", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  assert.match(source, /^\s*VIDEO_CHANNELS:\s*youtube,tiktok\s*$/m);
  assert.doesNotMatch(source, /^\s*VIDEO_CHANNELS:.*twitter/m);
  assert.doesNotMatch(source, /vars\.VIDEO_CHANNELS/);
  assert.doesNotMatch(source, /schedule:|cron:/);
  assert.match(source, /youtube_audience:/);
  assert.match(source, /- made_for_kids/);
  assert.match(source, /- not_made_for_kids/);
});

test("canonical YouTube audience decision is required before a queue claim", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const audienceGuard = source.indexOf("Owner must select the YouTube Made-for-Kids audience decision");
  const queueCall = source.indexOf('action: dryRun ? "peek" : "claim"');
  assert.ok(audienceGuard >= 0 && queueCall > audienceGuard);
  const runGuard = source.indexOf("Live publication requires an exact research_run_id");
  const channelGuard = source.indexOf("Live publication requires one exact publish_channel");
  assert.ok(runGuard >= 0 && runGuard < queueCall);
  assert.ok(channelGuard >= 0 && channelGuard < queueCall);
  assert.match(source, /youtubeMadeForKids: channel === "youtube" \? youtubeAudience === "made_for_kids"/);
});


test("exact review row selector is validated and enforced end to end", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  const publisher = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const queue = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");

  assert.match(workflow, /research_run_id:/);
  assert.match(workflow, /PUBLISH_RESEARCH_RUN_ID:/);
  assert.match(publisher, /PUBLISH_RESEARCH_RUN_ID/);
  assert.match(publisher, /normalizeReviewRunId\(process\.env\.PUBLISH_RESEARCH_RUN_ID\)/);
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


test("review run ID normalizer accepts only canonical or exact bare lowercase hex IDs", () => {
  assert.equal(normalizeReviewRunId("abcdef0123456789"), "rv-abcdef0123456789");
  assert.equal(normalizeReviewRunId("rv-abcdef0123456789"), "rv-abcdef0123456789");
  assert.equal(normalizeReviewRunId(undefined), "");
  assert.equal(normalizeReviewRunId(""), "");

  for (const value of [
    " ABCDEF0123456789",
    "ABCDEF0123456789",
    "abcdef01234567890",
    "abcdef012345678",
    " abcdef0123456789",
    "abcdef0123456789 ",
    "   ",
    "rv-ABCDEF0123456789",
  ]) {
    assert.throws(
      () => normalizeReviewRunId(value),
      /PUBLISH_RESEARCH_RUN_ID must be rv- followed by exactly 16 lowercase hex characters/,
    );
  }
});

test("publisher validates requested channel before claiming a queue lease", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const validation = source.indexOf("Requested channel is not in VIDEO_CHANNELS");
  const claim = source.indexOf('action: dryRun ? "peek" : "claim"');
  assert.ok(validation >= 0 && claim > validation);
});

test("publisher releases a claimed row before exiting when no eligible channels remain", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const start = source.indexOf("if (!remainingChannels.length)");
  const end = source.indexOf("const { selected: channels", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  const release = block.indexOf('action: "release"');
  const error = block.indexOf('error: "No remaining configured publish channels"');
  const marker = block.indexOf("REVIEW_QUEUE_NO_REMAINING_CHANNELS");
  assert.ok(release >= 0 && error > release && marker > error);
});

test("published feed preserves previously verified channels across exact-channel runs", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const feedChannels =/);
  assert.match(source, /item\.published_channels/);
  assert.match(source, /results\.map\(\(entry\) => entry\.channel\)/);
  assert.match(source, /isVerifiedPublicPostUrl\(channel, mergedPublicUrls\[channel\]\)/);
  assert.match(source, /channels: feedChannels/);
});


test("live publisher fail-closes on missing tracked CTA or unverifiable public URL", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const trackedUrl = new URL\(trackedCta\)/);
  assert.match(source, /isVerifiedPublicPostUrl\(channel, result\.publicUrl\)/);
  const ctaGuard = source.indexOf("tracked CTA is missing campaign or source");
  const urlGuard = source.indexOf("publisher returned no verified public URL");
  const publisherCall = source.indexOf("const result = await publisher({");
  const recordCall = source.indexOf('action: "record_channel"');
  assert.ok(ctaGuard >= 0 && ctaGuard < publisherCall);
  assert.ok(urlGuard >= 0 && publisherCall < urlGuard && urlGuard < recordCall);
});

test("published feed requires exactly one campaign id from the controlled execution", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /const campaignIds = \[\.\.\.new Set/);
  assert.match(source, /campaignId: campaignIds\[0\]/);
  const campaignGuard = source.indexOf("campaignIds.length !== 1");
  const feedPost = source.indexOf("PUBLISHED_FEED_URL,");
  assert.ok(campaignGuard >= 0 && feedPost > campaignGuard);
});

test("publisher rejects an empty configured channel set before claiming", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const guard = source.indexOf("VIDEO_CHANNELS must contain at least one service");
  const claim = source.indexOf('action: dryRun ? "peek" : "claim"');
  assert.ok(guard >= 0 && claim > guard);
});


test("publisher mutation paths require the social-production owner environment", () => {
  const queue = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  const feed = fs.readFileSync(new URL("../supabase/functions/published-video-feed/index.ts", import.meta.url), "utf8");
  const workflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  assert.match(queue, /OWNER_GATED_SUBJECT/);
  assert.match(queue, /hasOwnerGate/);
  assert.match(feed, /OWNER_GATED_SUBJECT/);
  assert.match(feed, /hasOwnerGate/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*social-production/);
});

test("queue approval is idempotent for the exact already-approved video", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  assert.match(source, /existing\?\.status === "approved"/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /idempotent: false/);
});

test("publication receipt records partial state and only becomes published after feed success", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  const partial = source.indexOf('state: "PARTIALLY_PUBLISHED"');
  const feed = source.indexOf("await postJson(PUBLISHED_FEED_URL");
  const published = source.indexOf('state: "PUBLISHED"', feed);
  assert.ok(partial >= 0);
  assert.ok(feed > partial);
  assert.ok(published > feed);
  assert.match(source, /updatePublicationReceipt/);
});

test("autonomous live publish requires an explicit YouTube audience decision", () => {
  const source = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");
  assert.match(source, /youtube_audience:/);
  assert.match(source, /default: unreviewed/);
  assert.match(source, /- made_for_kids/);
  assert.match(source, /- not_made_for_kids/);
  assert.match(source, /YOUTUBE_AUDIENCE: \$\{\{ inputs\.youtube_audience \}\}/);
  assert.doesNotMatch(source, /YOUTUBE_AUDIENCE:\s*not_made_for_kids/);
});
