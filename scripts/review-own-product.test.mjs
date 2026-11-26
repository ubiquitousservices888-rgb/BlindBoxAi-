import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnProductPromotion } from "../lib/review-own-product.mjs";

const item = { research_run_id: "rv-0123456789abcdef", title: "Reviewed fixture", status: "ready_for_review",
  video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/fixture.mp4" };
const selection = { mode: "own_product", product: "fake_check", research_run_id: item.research_run_id,
  reviewed_title: item.title, video_url: item.video_url };

test("each explicit product gets only its own Gumroad link on both primary channels", () => {
  for (const [product, slug] of [["fake_check", "bjfpgf"], ["sports_card_bundle", "fxloos"]]) {
    for (const channel of ["youtube", "tiktok"]) {
      const result = buildOwnProductPromotion(item, { ...selection, product }, channel);
      const url = `https://ubiquity6.gumroad.com/l/${slug}`;
      assert.equal(result.url, url);
      assert.deepEqual(result.caption.match(/https:\/\/\S+/g), [url]);
      assert.doesNotMatch(result.caption, /affiliate|ebay|amazon/i);
      assert.equal(result.revenueSource, "gumroad");
      assert.equal(result.source, channel);
    }
  }
});
test("unknown modes, products and channels are blocked", () => {
  for (const choice of [null, { ...selection, mode: "affiliate" }, { ...selection, product: "https://evil.example" }, { ...selection, product: "constructor" }]) {
    assert.throws(() => buildOwnProductPromotion(item, choice, "youtube"));
  }
  assert.throws(() => buildOwnProductPromotion(item, selection, "twitter"));
});
test("changed media, title, run or rejected state cannot qualify", () => {
  for (const patch of [{ video_url: item.video_url.replace("fixture", "replacement") }, { title: "Changed" },
    { research_run_id: "rv-1111111111111111" }, { status: "rejected" }, { status: "published" }]) {
    assert.throws(() => buildOwnProductPromotion({ ...item, ...patch }, selection, "youtube"));
  }
});
test("even matching selections cannot permit unapproved media hosts or URL forms", () => {
  for (const video_url of [item.video_url.replace("supabase.co", "supabase.co.evil.example"), item.video_url + "?token=fixture",
    item.video_url.replace("https://", "https://user@"), item.video_url.replace(".mp4", ".jpg")]) {
    assert.throws(() => buildOwnProductPromotion({ ...item, video_url }, { ...selection, video_url }, "tiktok"));
  }
});


// Disposable baseline for the protected path. All provider calls are injected;
// no actual Buffer mutation, media fetch, or public platform request is allowed.
import { buildReviewCaption } from "../lib/review-caption.mjs";
import { createReviewBufferPublisher } from "../lib/buffer-review-publisher.mjs";

const affiliateItem = { research_run_id: "rv-9c5d343830fb30a8", title: "Pokémon Card Rarity: Don't Mistake Common for Rare", vertical: "pokemon_tcg", status: "approved",
  video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/1790216466129-3143.mp4" };

function disposablePublisher(row, channel) {
  const channelId = "fixture-" + channel;
  const postId = "fixture-post-" + channel;
  const mediaId = channel === "youtube" ? "AbCdEf12345" : "1234567890";
  const publicUrl = channel === "youtube" ? `https://www.youtube.com/watch?v=${mediaId}` : `https://www.tiktok.com/@fixture/video/${mediaId}`;
  const events = [];
  const creates = [];
  let created;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === row.video_url) {
      return { status: 206, redirected: false, url: row.video_url,
        headers: { get: name => name.toLowerCase() === "content-type" ? "video/mp4" : null }, body: { cancel: async () => {} } };
    }
    assert.equal(new URL(String(url)).hostname, "api.buffer.com");
    const body = JSON.parse(init.body);
    const json = data => new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
    if (body.query.includes("query Organizations")) return json({ account: { organizations: [{ id: "org-1", name: "Fixture" }] } });
    if (body.query.includes("query Channels")) return json({ channels: [{ id: channelId, service: channel, serviceId: channel === "youtube" ? "UCwaUc4e4iv2Q4P1nxlVrTvw" : "fixture-tiktok", isQueuePaused: false, isDisconnected: false, isLocked: false }] });
    if (body.query.includes("query Existing")) return json({ posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    if (body.query.includes("mutation CreateReviewVideo")) {
      creates.push(body.variables.input);
      events.push("create");
      created = { id: postId, text: body.variables.input.text, status: "sending", channelId, assets: [{ source: row.video_url }] };
      return json({ createPost: { post: created } });
    }
    if (body.query.includes("query VerifySentPost")) {
      assert.equal(body.variables.postId, postId);
      assert.ok(created, "receipt must follow a simulated create");
      return json({ post: { ...created, status: "sent", externalLink: publicUrl } });
    }
    throw new Error("Unexpected disposable Buffer query");
  };
  const publisher = createReviewBufferPublisher({ token: "fixture-token", organizationId: "org-1", fetchImpl,
    mediaProbe: async () => ({ width: 720, height: 1280, durationSeconds: 30 }),
    publicHttpProbe: async ({ externalLink }) => {
      assert.equal(externalLink, publicUrl);
      assert.ok(events.includes("accepted"), "durable accepted checkpoint precedes public proof");
      events.push("proof");
      return { status: 200, mediaId, publicMediaAvailable: true, checkedAt: "2026-11-26T00:00:00.000Z" };
    } });
  return { publisher, creates, events, postId, publicUrl };
}

test("baseline: affiliate caption reaches both simulated channels and exact receipt prevents redispatch", async () => {
  for (const channel of ["youtube", "tiktok"]) {
    const built = buildReviewCaption(affiliateItem, channel);
    const fixture = disposablePublisher(affiliateItem, channel);
    const input = { channel, videoUrl: affiliateItem.video_url, caption: built.caption, title: built.title, youtubeMadeForKids: false,
      onAccepted: async receipt => { assert.deepEqual(receipt, { channel, postId: fixture.postId }); fixture.events.push("accepted"); } };
    const first = await fixture.publisher(input);
    assert.equal(first.publicUrl, fixture.publicUrl);
    assert.equal(first.proofKind, "public_player");
    assert.deepEqual(fixture.events, ["create", "accepted", "proof"]);
    assert.equal(fixture.creates[0].text, built.caption);
    const retry = await fixture.publisher({ ...input, acceptedPostId: fixture.postId });
    assert.equal(retry.duplicate, true);
    assert.equal(fixture.creates.length, 1);
  }
});

test("baseline: current protected publisher rejects Gumroad-only caption before any create", async () => {
  for (const channel of ["youtube", "tiktok"]) {
    assert.throws(() => buildReviewCaption(item, channel), /cannot publish/);
    const built = buildOwnProductPromotion(item, selection, channel);
    const fixture = disposablePublisher(item, channel);
    await assert.rejects(() => fixture.publisher({ channel, videoUrl: item.video_url, caption: built.caption, title: built.title, youtubeMadeForKids: false }), /affiliate disclosure/);
    assert.equal(fixture.creates.length, 0);
    assert.deepEqual(fixture.events, []);
  }
});
