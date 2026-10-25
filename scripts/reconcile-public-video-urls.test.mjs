import test from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import { REVIEW_YOUTUBE_CHANNEL_ID } from "../lib/buffer-review-publisher.mjs";
import { reconcilePublicVideoUrls } from "./reconcile-public-video-urls.mjs";

const row = { research_run_id: "rv-0123456789abcdef", video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/disposable.mp4", buffer_post_ids: { youtube: "known-post" } };
const post = { id: "known-post", channelId: "yt-channel", status: "sent", externalLink: "https://youtu.be/AbCdEf12345", assets: [{ source: row.video_url }],
  text: `https://blindboxai.com/?campaign=bb-${row.research_run_id}&source=youtube\n${DISCLOSURE}` };

function options(overrides = {}) {
  const operations = [];
  return { operations, input: { inventory: [row], token: "disposable-token", organizationId: "disposable-org",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.buffer.com");
      assert.equal(init.redirect, "error");
      const body = JSON.parse(init.body);
      assert.doesNotMatch(body.query, /mutation/);
      operations.push(body);
      const data = body.query.includes("query Organizations") ? { account: { organizations: [{ id: "disposable-org" }] } }
        : body.query.includes("query Channels") ? { channels: [{ id: "yt-channel", service: "youtube", serviceId: REVIEW_YOUTUBE_CHANNEL_ID }] }
        : { post: { ...post, ...overrides } };
      return new Response(JSON.stringify({ data }));
    },
    probeImpl: async () => ({ status: 200, publicMediaAvailable: true, mediaId: "AbCdEf12345", checkedAt: "2026-10-25T20:00:00Z" }),
  } };
}

test("historical receipt reconciliation reads only exact IDs and returns separate missing-ID evidence", async () => {
  const s = options();
  const results = await reconcilePublicVideoUrls(s.input);
  assert.equal(results[0].status, "VERIFIED");
  assert.equal(results[0].publicUrl, "https://www.youtube.com/watch?v=AbCdEf12345");
  assert.equal(results[1].reason, "MISSING_PROVIDER_POST_ID");
  assert.deepEqual(s.operations.at(-1).variables, { postId: "known-post" });
});

test("receipt, source-media, campaign and private-page failures never produce a verified URL", async () => {
  for (const [overrides, reason] of [
    [{ channelId: "wrong-channel" }, "PROVIDER_IDENTITY_MISMATCH"],
    [{ assets: [{ source: "https://unapproved.example/video.mp4" }] }, "APPROVED_MEDIA_IDENTITY_UNVERIFIED"],
    [{ text: `https://blindboxai.com/\n${DISCLOSURE}` }, "APPROVED_ATTRIBUTION_UNVERIFIED"],
    [{ externalLink: "https://youtube.com.attacker.example/watch?v=AbCdEf12345" }, "PUBLIC_MEDIA_UNVERIFIED"],
    [{ status: "error" }, "PROVIDER_NOT_SENT"],
  ]) {
    const s = options(overrides);
    assert.equal((await reconcilePublicVideoUrls(s.input))[0].reason, reason);
  }
  const s = options();
  s.input.probeImpl = async () => { throw new Error("private page containing untrusted details"); };
  const receipts = await reconcilePublicVideoUrls(s.input);
  assert.equal(receipts[0].reason, "PUBLIC_MEDIA_UNVERIFIED");
  assert.doesNotMatch(JSON.stringify(receipts), /untrusted details|disposable-token/);
});

test("duplicate provider IDs are rejected before any network request", async () => {
  const s = options();
  s.input.inventory = [row, { ...row, research_run_id: "rv-1111111111111111" }];
  await assert.rejects(() => reconcilePublicVideoUrls(s.input), /duplicate inventory/);
  assert.equal(s.operations.length, 0);
});
