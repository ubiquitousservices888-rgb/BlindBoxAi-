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
import { stripTypeScriptTypes } from "node:module";
import { feedChannelGrowthPatch } from "../supabase/functions/_shared/published-feed-growth.mjs";

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

// Load the queue's helpers and the record/release handlers from the Edge
// Function source and run them against an in-memory table.
const queueSource = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const slice = (from, to) => {
  const begin = queueSource.indexOf(from);
  const end = queueSource.indexOf(to, begin);
  assert.ok(begin >= 0 && end > begin, `missing ${from}`);
  return queueSource.slice(begin, end);
};
const queueCode = stripTypeScriptTypes([
  slice("function clean(", "const REVIEW_BUCKET"),
  slice("const STALE_PUBLISHING_LEASE_MS", "async function peek("),
  slice("function leaseTokenFrom(", "async function recordSubmission("),
  slice("async function recordChannel(", "Deno.serve("),
].join("\n"));
const LEASE = "2026-11-09T22:00:00.000Z";
const YT = "https://www.youtube.com/watch?v=AZOsnqn48rI";

function queueHarness(row) {
  const rows = [structuredClone(row)];
  const db = { from(name) {
    assert.equal(name, "review_video_queue");
    let patch;
    const filters = [];
    const matches = (r) => filters.every(([op, key, value]) =>
      op === "eq" ? r[key] === value : op === "notNull" ? r[key] != null : r[key] == null);
    const run = () => {
      const hit = rows.filter(matches);
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return hit.map((r) => structuredClone(r));
    };
    const query = {
      select() { return query; }, order() { return query; }, or() { return query; }, limit() { return query; },
      update(value) { patch = value; return query; },
      eq(key, value) { filters.push(["eq", key, value]); return query; },
      not(key, op, value) { assert.equal(op, "is"); assert.equal(value, null); filters.push(["notNull", key]); return query; },
      is(key, value) { assert.equal(value, null); filters.push(["isNull", key]); return query; },
      async maybeSingle() { return { data: run()[0] || null, error: null }; },
      then(resolve, reject) { try { resolve({ data: run(), error: null }); } catch (error) { reject(error); } },
    };
    return query;
  } };
  const make = new Function("db", "githubAuthorized", "json", `${queueCode}
    return { recordChannel, release, complete, nextApprovedForChannel, claimableStatusFilter };`);
  const api = make(db, async () => true, (body, status = 200) => ({ body, status }));
  return { row: rows[0], api, call: (fn, body) => api[fn]({}, body) };
}

const liveRow = {
  research_run_id: "rv-4815685fb0b10117", status: "publishing", publishing_at: LEASE, published_at: "2026-11-09T21:00:00.000Z",
  published_channels: ["youtube"], public_urls: { youtube: YT }, buffer_post_ids: { youtube: "yt-post" },
};
const recordLinkedin = (extra = {}) => ({ researchRunId: liveRow.research_run_id, leaseToken: LEASE, channel: "linkedin",
  externalId: "li-post", publicUrl: linkedinUrl, targetChannels: ["youtube", "tiktok"], ...extra });

test("recording LinkedIn on a published row keeps it published with its first publish time", async () => {
  const h = queueHarness(liveRow);
  const result = await h.call("recordChannel", recordLinkedin());
  assert.equal(result.status, 200);
  assert.equal(result.body.complete, true);
  assert.equal(h.row.status, "published");
  assert.equal(h.row.published_at, liveRow.published_at);
  assert.deepEqual(h.row.published_channels, ["youtube", "linkedin"]);
  assert.equal(h.row.public_urls.linkedin, linkedinUrl);
  assert.equal(h.row.buffer_post_ids.youtube, "yt-post");
});

test("recording LinkedIn on a YouTube-only row does not mark it published", async () => {
  const h = queueHarness({ ...liveRow, published_at: null });
  const result = await h.call("recordChannel", recordLinkedin());
  assert.equal(result.status, 200);
  assert.equal(result.body.complete, false);
  assert.equal(h.row.status, "publishing");
  assert.equal(h.row.published_at, null);
});

test("LinkedIn is refused before a verified primary channel and never counts as a target", async () => {
  const notLive = queueHarness({ ...liveRow, published_at: null, published_channels: [], public_urls: {} });
  assert.equal((await notLive.call("recordChannel", recordLinkedin())).status, 409);
  assert.deepEqual(notLive.row.published_channels, []);
  const h = queueHarness(liveRow);
  assert.equal((await h.call("recordChannel", recordLinkedin({ targetChannels: ["youtube", "linkedin"] }))).status, 400);
  assert.equal((await h.call("recordChannel", recordLinkedin({ publicUrl: "https://www.linkedin.com/in/someone/" }))).status, 400);
  assert.deepEqual(h.row.published_channels, ["youtube"]);
});

test("giving up a lease returns a published row to published and anything else to approved", async () => {
  for (const fn of ["release", "complete"]) {
    const body = { researchRunId: liveRow.research_run_id, leaseToken: LEASE, error: "lookup failed" };
    const published = queueHarness(liveRow);
    assert.equal((await published.call(fn, body)).status, 200);
    assert.equal(published.row.status, "published");
    assert.equal(published.row.publishing_at, null);
    const fresh = queueHarness({ ...liveRow, published_at: null });
    assert.equal((await fresh.call(fn, body)).status, 200);
    assert.equal(fresh.row.status, "approved");
    const otherLease = queueHarness(liveRow);
    await otherLease.call(fn, { ...body, leaseToken: "2026-11-09T23:00:00.000Z" });
    assert.equal(otherLease.row.status, "publishing");
  }
});

test("LinkedIn looks up only one exact owner-named row and may follow a published row", async () => {
  const h = queueHarness(liveRow);
  assert.equal(await h.api.nextApprovedForChannel("linkedin", ""), null);
  assert.match(h.api.claimableStatusFilter("linkedin"), /,status\.eq\.published$/);
  assert.doesNotMatch(h.api.claimableStatusFilter("youtube"), /status\.eq\.published/);
});

test("homepage ledger accepts only a grown channel list or a partial row becoming published", () => {
  const existing = { research_run_id: liveRow.research_run_id, title: "T", vertical: "pokemon_tcg", video_url: videoUrl,
    campaign_id: "bb-rv-4815685fb0b10117", status: "published", channels: ["youtube"], buffer_post_ids: { youtube: "yt-post" } };
  const grown = { ...existing, channels: ["linkedin", "youtube"], buffer_post_ids: { youtube: "yt-post", linkedin: "li-post" } };
  assert.deepEqual(feedChannelGrowthPatch(existing, grown),
    { channels: grown.channels, buffer_post_ids: grown.buffer_post_ids, status: "published" });
  assert.equal(feedChannelGrowthPatch(existing, existing), null);
  assert.equal(feedChannelGrowthPatch(existing, { ...grown, buffer_post_ids: { youtube: "changed", linkedin: "li-post" } }), null);
  assert.equal(feedChannelGrowthPatch(existing, { ...grown, channels: ["linkedin"] }), null);
  assert.equal(feedChannelGrowthPatch(existing, { ...grown, title: "Other" }), null);
  assert.equal(feedChannelGrowthPatch(existing, { ...grown, status: "partial" }), null);
  assert.equal(feedChannelGrowthPatch({ ...existing, status: "partial" }, existing)?.status, "published");
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
