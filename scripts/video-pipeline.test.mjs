import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURE, STATES, approve, assertPublishableState, createBufferPublisher, createRenderRecord, generateVideoScript, markRendered, publishApproved, reject, selectDailyProduct, validateVerifiedProduct } from "../lib/video-pipeline.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");
const product = { id: "verified-one", name: "Verified One", productUrl: "https://blindboxai.com/series/verified-one", sources: [{ id: "official", url: "https://brand.example/products/one", checkedAt: "2026-08-08T12:00:00.000Z", status: "verified" }], claims: [{ text: "The official listing names this series Verified One.", sourceId: "official" }] };
const ready = () => markRendered(createRenderRecord(product, generateVideoScript(product, now), ["tiktok", "instagram"], now), { id: "render-1", videoUrl: "https://cdn.example/video.mp4" }, now);
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("verified-data gate", () => {
  it("rejects unsourced claims", () => assert.throws(() => validateVerifiedProduct({ ...product, claims: [{ text: "invented" }] }, now)));
  it("rejects stale sources", () => assert.throws(() => validateVerifiedProduct({ ...product, sources: [{ ...product.sources[0], checkedAt: "2026-01-01T00:00:00.000Z" }] }, now)));
  it("fails daily selection closed when none qualify", () => assert.throws(() => selectDailyProduct([], now)));
  it("generates only sourced facts, BlindBoxAI CTA, and disclosure", () => {
    const script = generateVideoScript(product, now);
    assert.deepEqual(script.facts, [product.claims[0].text]);
    assert.match(script.caption, new RegExp(DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(script.caption, /https:\/\/blindboxai\.com\/series\/verified-one/);
  });
});

describe("render and manual review gates", () => {
  it("requires a hosted HTTPS MP4", () => assert.throws(() => markRendered(createRenderRecord(product, generateVideoScript(product, now), ["tiktok"], now), { id: "x", videoUrl: "file:///video.mp4" }, now)));
  it("cannot approve before READY_FOR_REVIEW", () => assert.throws(() => approve(createRenderRecord(product, generateVideoScript(product, now), ["tiktok"], now), now)));
  it("reject records cannot publish", async () => await assert.rejects(() => publishApproved(reject(ready(), "bad audio", now), async () => ({ id: "x" }), now)));
  it("rejects unapproved state before any publishing preflight", () => {
    assert.throws(() => assertPublishableState(ready()), /Manual approval is required/);
    assert.equal(assertPublishableState(approve(ready(), now)), true);
  });
});

describe("safe publishing", () => {
  it("requires manual approval", async () => await assert.rejects(() => publishApproved(ready(), async () => ({ id: "x" }), now)));
  it("prevents duplicates and retries only failed channels", async () => { let calls = []; let first = true; const publisher = async ({ channel }) => { calls.push(channel); if (channel === "instagram" && first) throw new Error("temporary"); return { id: `${channel}-1` }; }; let state = await publishApproved(approve(ready(), now), publisher, now); assert.equal(state.state, STATES.PARTIAL); assert.deepEqual(calls, ["tiktok", "instagram"]); first = false; calls = []; state = await publishApproved(state, publisher, now); assert.equal(state.state, STATES.PUBLISHED); assert.deepEqual(calls, ["instagram"]); assert.equal(state.publications.tiktok.externalId, "tiktok-1"); });

  it("compacts Twitter captions without dropping the CTA or disclosure", async () => {
    const longProduct = {
      ...product,
      claims: [{ text: `Verified collector detail ${"x".repeat(320)}`, sourceId: "official" }],
    };
    const record = markRendered(
      createRenderRecord(longProduct, generateVideoScript(longProduct, now), ["twitter"], now),
      { id: "render-long", videoUrl: "https://cdn.example/long.mp4" },
      now,
    );
    let sentCaption = null;
    const state = await publishApproved(approve(record, now), async ({ caption }) => {
      sentCaption = caption;
      return { id: "twitter-1" };
    }, now);
    assert.equal(state.state, STATES.PUBLISHED);
    assert.ok(sentCaption.length <= 280);
    assert.match(sentCaption, /https:\/\/blindboxai\.com\/series\/verified-one/);
    assert.ok(sentCaption.includes(DISCLOSURE));
  });

  it("uses the current Buffer GraphQL endpoint and video assets", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      const query = calls.at(-1).body.query;
      if (query.includes("query Organizations")) return jsonResponse({ data: { account: { organizations: [{ id: "org-1", name: "Public" }] } } });
      if (query.includes("query Channels")) return jsonResponse({ data: { channels: [{ id: "channel-x", name: "X", displayName: "X", service: "twitter", isQueuePaused: false, isDisconnected: false, isLocked: false }] } });
      if (query.includes("query Existing")) return jsonResponse({ data: { posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
      if (query.includes("mutation CreateVideo")) return jsonResponse({ data: { createPost: { post: { id: "post-1", text: "caption", status: "scheduled", channelId: "channel-x" } } } });
      throw new Error("unexpected Buffer query");
    };

    const publisher = createBufferPublisher({ token: "test-token", organizationId: "org-1", fetchImpl });
    const result = await publisher({ channel: "twitter", videoUrl: "https://cdn.example/video.mp4", caption: `${product.name}\n${product.productUrl}\n${DISCLOSURE}` });
    assert.equal(result.id, "post-1");
    assert.ok(calls.every((call) => call.url === "https://api.buffer.com"));
    assert.match(calls.at(-1).body.query, /assets:\s*\[\{ video:/);
  });

  it("fails closed when a target Buffer queue is paused", async () => {
    const fetchImpl = async (_url, options) => {
      const query = JSON.parse(options.body).query;
      if (query.includes("query Organizations")) return jsonResponse({ data: { account: { organizations: [{ id: "org-1", name: "Public" }] } } });
      if (query.includes("query Channels")) return jsonResponse({ data: { channels: [{ id: "channel-x", name: "X", displayName: "X", service: "twitter", isQueuePaused: true, isDisconnected: false, isLocked: false }] } });
      throw new Error("unexpected Buffer query");
    };
    const publisher = createBufferPublisher({ token: "test-token", organizationId: "org-1", fetchImpl });
    await assert.rejects(
      () => publisher({ channel: "twitter", videoUrl: "https://cdn.example/video.mp4", caption: `${product.name}\n${product.productUrl}\n${DISCLOSURE}` }),
      /expected exactly one active Buffer channel, found 0/,
    );
  });
});
