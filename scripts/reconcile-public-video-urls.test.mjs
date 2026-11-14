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
        : body.query.includes("query VerifySentPost") ? { post: { ...post, ...overrides } }
        : (() => { throw new Error("Unexpected GraphQL operation"); })();
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
  const reads = s.operations.filter(op => !/query (?:Organizations|Channels)\b/.test(op.query));
  assert.equal(reads.length, 1);
  for (const operation of reads) {
    assert.match(operation.query, /query VerifySentPost\(\$postId: PostId!\)/);
    assert.match(operation.query, /post\(input: \{ id: \$postId \}\)/);
    assert.deepEqual(operation.variables, { postId: "known-post" });
  }
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

test("multiple missing provider IDs remain separate unverified rows", async () => {
  const s = options();
  s.input.inventory = [row, { ...row, research_run_id: "rv-1111111111111111", buffer_post_ids: { youtube: null, tiktok: null } },
    { ...row, research_run_id: "rv-2222222222222222", buffer_post_ids: { youtube: null, tiktok: null } }];
  const receipts = await reconcilePublicVideoUrls(s.input);
  assert.deepEqual(receipts.filter(r => r.reason === "MISSING_PROVIDER_POST_ID").map(({ researchRunId, channel }) => [researchRunId, channel]), [
    ["rv-0123456789abcdef", "tiktok"],
    ["rv-1111111111111111", "youtube"],
    ["rv-1111111111111111", "tiktok"],
    ["rv-2222222222222222", "youtube"],
    ["rv-2222222222222222", "tiktok"],
  ]);
});

test("missing Buffer configuration fails before account reads", async () => {
  for (const change of [{ token: "" }, { organizationId: "" }]) {
    const s = options();
    await assert.rejects(() => reconcilePublicVideoUrls({ ...s.input, ...change }), /configuration unavailable/);
    assert.equal(s.operations.length, 0);
  }
});

test("failed checks retain a labelled permalink candidate and fixed non-secret diagnostics", async () => {
  const s = options();
  s.input.probeImpl = async () => { throw Object.assign(new Error("untrusted raw response"), { reason: "PUBLIC_HTTP_STATUS", httpStatus: 403 }); };
  const [receipt] = await reconcilePublicVideoUrls(s.input);
  assert.equal(receipt.status, "UNVERIFIED");
  assert.equal(receipt.candidatePublicUrl, "https://www.youtube.com/watch?v=AbCdEf12345");
  assert.equal(receipt.publicCheckReason, "PUBLIC_HTTP_STATUS");
  assert.equal(receipt.publicHttpStatus, 403);
  assert.doesNotMatch(JSON.stringify(receipt), /untrusted raw/);
  const media = options({ assets: [{ source: "https://unapproved.example/private-source.mp4?token=never-print" }] });
  const [mismatch] = await reconcilePublicVideoUrls(media.input);
  assert.deepEqual(mismatch.sourceMatchTypes, ["OTHER_HTTPS_SOURCE"]);
  assert.equal(mismatch.sourceAssetCount, 1);
  assert.equal(mismatch.status, "UNVERIFIED");
  assert.equal(mismatch.sourceProof.sourceHost, "unapproved.example");
  assert.doesNotMatch(JSON.stringify(mismatch), /private-source|never-print|token=/);
  const malformed = options({ assets: [null] });
  const [invalidAsset] = await reconcilePublicVideoUrls(malformed.input);
  assert.equal(invalidAsset.status, "UNVERIFIED");
  assert.deepEqual(invalidAsset.sourceMatchTypes, ["SOURCE_NOT_A_URL"]);
});

test("a byte-proven approved-host mirror can reconcile, while a hash mismatch cannot reach public verification", async () => {
  for (const matched of [true, false]) {
    const s = options({ assets: [{ source: "https://disposable.public.blob.vercel-storage.com/media/review/mirror.mp4" }] });
    let probes = 0;
    s.input.sourceProbeImpl = async () => ({ matched, method: "SHA256", ...(matched ? {} : { reason: "SOURCE_BYTES_DIFFER" }) });
    s.input.probeImpl = async () => { probes++; return { status: 200, publicMediaAvailable: true, mediaId: "AbCdEf12345", checkedAt: "2026-10-26T12:00:00Z" }; };
    const [receipt] = await reconcilePublicVideoUrls(s.input);
    assert.equal(receipt.status, matched ? "VERIFIED" : "UNVERIFIED");
    assert.equal(receipt.providerIdentityVerified, true);
    assert.equal(receipt.attributionVerified, true);
    assert.equal(probes, matched ? 1 : 0);
  }
});
