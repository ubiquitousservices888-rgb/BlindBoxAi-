import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import {
  REVIEW_PUBLISH_CHANNELS,
  bufferLookupReason,
  canonicalPublicPostUrl,
  createReviewBufferPublisher,
  isVerifiedPublicPostUrl,
  waitForVerifiedSentPost,
} from "../lib/buffer-review-publisher.mjs";
import { buildReviewCaption } from "../lib/review-caption.mjs";

const caption = `Collector research https://blindboxai.com/?campaign=bb-rv-0123456789abcdef\n${DISCLOSURE}`;
const videoUrl = "https://media.example/video.mp4";
const linkedinUrl = "https://www.linkedin.com/feed/update/urn:li:share:7392012345678901234/";
const base = {
  token: "disposable-token", organizationId: "disposable-org", channelId: "li-channel", channel: "linkedin",
  postId: "li-post", expectedCaption: caption, expectedVideoUrl: videoUrl, attempts: 2, delayMs: 0,
};
const sent = { id: "li-post", channelId: "li-channel", text: caption, status: "sent", externalLink: linkedinUrl, assets: [{ source: videoUrl }] };
const answer = (post) => async () => new Response(JSON.stringify({ data: { post } }), { headers: { "content-type": "application/json" } });

test("LinkedIn is an allowed review destination and accepts only post permalinks", () => {
  assert.ok(REVIEW_PUBLISH_CHANNELS.includes("linkedin"));
  for (const url of [
    linkedinUrl,
    "https://linkedin.com/feed/update/urn:li:activity:7392012345678901234",
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A7392012345678901234/",
  ]) assert.equal(isVerifiedPublicPostUrl("linkedin", url), true, url);
  for (const url of [
    "http://www.linkedin.com/feed/update/urn:li:share:7392012345678901234/",
    "https://www.linkedin.com/in/someone/",
    "https://www.linkedin.com/feed/update/urn:li:share:7392012345678901234/?trk=x",
    "https://evil.example/feed/update/urn:li:share:7392012345678901234/",
    "https://www.linkedin.com.evil.example/feed/update/urn:li:share:7392012345678901234/",
  ]) assert.equal(isVerifiedPublicPostUrl("linkedin", url), false, url);
  assert.equal(canonicalPublicPostUrl("linkedin", "https://linkedin.com/feed/update/urn%3Ali%3AugcPost%3A7392012345678901234"),
    "https://www.linkedin.com/feed/update/urn:li:ugcPost:7392012345678901234/");
});

test("LinkedIn is proven by Buffer's sent receipt and never by a public page fetch", async () => {
  let probes = 0;
  const result = await waitForVerifiedSentPost({ ...base, fetchImpl: answer(sent), httpProbeImpl: async () => { probes++; throw new Error("no"); } });
  assert.equal(probes, 0);
  assert.equal(result.proofKind, "buffer_receipt");
  assert.equal(result.publicUrl, linkedinUrl);
  assert.ok(Number.isFinite(Date.parse(result.receiptCheckedAt)));
});

test("LinkedIn receipt still requires the exact caption and exact video", async () => {
  await assert.rejects(() => waitForVerifiedSentPost({ ...base, fetchImpl: answer({ ...sent, text: `${caption} edited` }) }), /does not match the approved caption/);
  await assert.rejects(() => waitForVerifiedSentPost({ ...base, fetchImpl: answer({ ...sent, assets: [{ source: "https://media.example/other.mp4" }] }) }), /exact approved video asset/);
  await assert.rejects(() => waitForVerifiedSentPost({ ...base, fetchImpl: answer({ ...sent, externalLink: "https://www.linkedin.com/in/someone/" }) }), /not a valid public post URL/);
});

test("a failed Buffer lookup reports why instead of a generic reason", async () => {
  await assert.rejects(
    () => waitForVerifiedSentPost({ ...base, fetchImpl: async () => new Response(JSON.stringify({ errors: [{ message: "Cannot query field \"source\" on type \"Asset\"" }] }), { status: 200 }) }),
    (error) => error.reason === "BUFFER_LOOKUP_GRAPHQL_ERROR" && /Cannot query field/.test(error.message) && !/disposable-token/.test(error.message),
  );
  await assert.rejects(
    () => waitForVerifiedSentPost({ ...base, fetchImpl: async () => new Response("slow down", { status: 429 }) }),
    (error) => error.reason === "BUFFER_LOOKUP_RATE_LIMITED",
  );
  await assert.rejects(
    () => waitForVerifiedSentPost({ ...base, fetchImpl: async () => new Response(JSON.stringify({ message: "denied" }), { status: 401 }) }),
    (error) => error.reason === "BUFFER_LOOKUP_HTTP_401",
  );
  const timeout = new Error("timed out"); timeout.name = "TimeoutError";
  assert.equal(bufferLookupReason(timeout), "BUFFER_LOOKUP_TIMEOUT");
  assert.equal(bufferLookupReason(new Error("socket hang up")), "BUFFER_LOOKUP_UNAVAILABLE");
});

test("LinkedIn caption keeps the tracked BlindBoxAI page and the affiliate disclosure", () => {
  const landings = JSON.parse(fs.readFileSync(new URL("../data/review-video-landings.json", import.meta.url), "utf8")).landings;
  const item = { research_run_id: "rv-4815685fb0b10117", title: "How to verify your Mew ex card", vertical: "pokemon_tcg",
    video_url: landings["rv-4815685fb0b10117"].video_url };
  const built = buildReviewCaption(item, "linkedin");
  assert.equal(built.source, "linkedin");
  assert.match(built.caption, /https:\/\/(?:www\.)?blindboxai\.com\/guides\/mew-ex-152-vs-158\?campaign=bb-rv-4815685fb0b10117&source=linkedin/);
  assert.ok(built.caption.includes(DISCLOSURE));
  assert.doesNotMatch(built.caption, /ebay\.com/i);
  assert.ok(built.caption.length <= 3000);
});

test("publisher refuses destinations without a proof rule before touching Buffer", async () => {
  let calls = 0;
  const publisher = createReviewBufferPublisher({ token: "t", organizationId: "org-1", fetchImpl: async () => { calls++; return new Response("{}"); } });
  await assert.rejects(() => publisher({ channel: "twitter", videoUrl, caption }), /no verified public media proof/);
  assert.equal(calls, 0);
});

test("runner sends LinkedIn only as an exact add-on after a primary channel is live", () => {
  const source = fs.readFileSync(new URL("./publish-approved-review-queue.mjs", import.meta.url), "utf8");
  assert.match(source, /ADDON_VIDEO_CHANNELS/);
  assert.match(source, /add-on post refused until this video is verified live/);
  assert.match(source, /REVIEW_QUEUE_BUFFER_RECEIPT_PROOF/);
  assert.match(source, /result\.proofKind !== "public_player"/);
  assert.match(source, /REVIEW_QUEUE_FEED_DEFERRED/);
  const workflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
  assert.match(workflow, /^\s*ADDON_VIDEO_CHANNELS:\s*linkedin\s*$/m);
  assert.match(workflow, /^\s*VIDEO_CHANNELS:\s*youtube,tiktok\s*$/m);
});

test("queue keeps LinkedIn out of the published decision and restores published rows", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
  assert.match(source, /const PRIMARY_PUBLISH_CHANNELS = \["youtube", "tiktok"\]/);
  assert.match(source, /const ADDON_PUBLISH_CHANNELS = \["linkedin"\]/);
  assert.match(source, /isAddOnChannel\(channel\) \? `\$\{base\},status\.eq\.published` : base/);
  assert.match(source, /isAddOnChannel\(channel\) && !hasVerifiedPrimaryChannel\(item\)/);
  assert.match(source, /Add-on channel requires a verified primary channel first/);
  assert.match(source, /targetChannels\.some\(\(value: string\) => !PRIMARY_PUBLISH_CHANNELS\.includes\(value\)\)/);
  assert.match(source, /published_at: current\.published_at \|\| now/);
  assert.match(source, /\.not\("published_at", "is", null\)/);
  assert.match(source, /\.is\("published_at", null\)/);
  const feed = fs.readFileSync(new URL("../supabase/functions/published-video-feed/index.ts", import.meta.url), "utf8");
  assert.match(feed, /canonical\.channels\.length > existingCanonical\.channels\.length/);
  assert.match(feed, /canonical\.buffer_post_ids\[channel\] === id/);
});

test("LinkedIn post is created once on the single LinkedIn channel with no YouTube metadata", async () => {
  const creates = [];
  let created;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === videoUrl) {
      return { status: 206, redirected: false, url: videoUrl,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "video/mp4" : null }, body: { cancel: async () => {} } };
    }
    const body = JSON.parse(init.body);
    const json = (data) => new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
    if (body.query.includes("query Organizations")) return json({ account: { organizations: [{ id: "org-1", name: "Public" }] } });
    if (body.query.includes("query Channels")) return json({ channels: [
      { id: "yt", service: "youtube", serviceId: "UCwaUc4e4iv2Q4P1nxlVrTvw", isQueuePaused: false, isDisconnected: false, isLocked: false },
      { id: "li-channel", service: "linkedin", serviceId: "li-1", isQueuePaused: true, isDisconnected: false, isLocked: false },
    ] });
    if (body.query.includes("query Existing")) return json({ posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    if (body.query.includes("mutation CreateReviewVideo")) {
      creates.push(body.variables.input);
      created = { id: "li-post", text: body.variables.input.text, status: "sending", channelId: "li-channel", assets: [{ source: videoUrl }] };
      return json({ createPost: { post: created } });
    }
    if (body.query.includes("query VerifySentPost")) return json({ post: { ...created, status: "sent", externalLink: linkedinUrl } });
    throw new Error("unexpected Buffer query");
  };
  let probes = 0;
  const publisher = createReviewBufferPublisher({ token: "t", organizationId: "org-1", fetchImpl,
    mediaProbe: async () => { throw new Error("YouTube-only media probe must not run for LinkedIn"); },
    publicHttpProbe: async () => { probes++; throw new Error("no public probe for LinkedIn"); } });
  const accepted = [];
  const result = await publisher({ channel: "linkedin", videoUrl, caption, title: "ignored", onAccepted: async (r) => accepted.push(r) });
  assert.equal(creates.length, 1);
  assert.equal(creates[0].channelId, "li-channel");
  assert.equal(creates[0].metadata, undefined);
  assert.equal(creates[0].mode, "shareNow");
  assert.deepEqual(accepted, [{ channel: "linkedin", postId: "li-post" }]);
  assert.equal(result.proofKind, "buffer_receipt");
  assert.equal(result.duplicate, false);
  assert.equal(probes, 0);
});
