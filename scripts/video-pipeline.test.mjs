import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEbaySearchUrl } from "../lib/affiliate-policy.mjs";
import { AMAZON_ASSOCIATE_TAG } from "../lib/amazon-associates.mjs";
import {
  DISCLOSURE,
  STATES,
  approve,
  assertAffiliatePathValidation,
  assertPublishableState,
  createBufferPublisher,
  createRenderRecord,
  generateVideoScript,
  markRendered,
  pickAffiliateMonetizationPath,
  publishApproved,
  reject,
  selectDailyProduct,
  validateVerifiedProduct,
} from "../lib/video-pipeline.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");
const product = { id: "verified-one", name: "Verified One figure blind box", brand: "POP MART", productUrl: "https://blindboxai.com/series/verified-one", sources: [{ id: "official", url: "https://brand.example/products/one", checkedAt: "2026-08-08T12:00:00.000Z", status: "verified" }], claims: [{ text: "The official listing names this series Verified One.", sourceId: "official" }] };
const ready = () => markRendered(createRenderRecord(product, generateVideoScript(product, now), ["tiktok", "instagram"], now), { id: "render-1", videoUrl: "https://cdn.example/video.mp4" }, now);
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("verified-data gate", () => {
  it("rejects unsourced claims", () => assert.throws(() => validateVerifiedProduct({ ...product, claims: [{ text: "invented" }] }, now)));
  it("rejects stale sources", () => assert.throws(() => validateVerifiedProduct({ ...product, sources: [{ ...product.sources[0], checkedAt: "2026-01-01T00:00:00.000Z" }] }, now)));
  it("rejects source timestamps that look ISO-like but do not parse", () => {
    const invalid = { ...product, sources: [{ ...product.sources[0], checkedAt: "2026-99-99T12:00:00.000Z" }] };
    assert.throws(() => validateVerifiedProduct(invalid, now), /not verified/);
  });
  it("fails daily selection closed when none qualify", () => assert.throws(() => selectDailyProduct([], now)));
  it("generates only sourced facts, BlindBoxAI CTA, and disclosure", () => {
    const script = generateVideoScript(product, now);
    assert.deepEqual(script.facts, [product.claims[0].text]);
    assert.match(script.caption, new RegExp(DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(script.caption, /https:\/\/blindboxai\.com\/series\/verified-one/);
    assert.equal(script.affiliatePath.monetizationPath, "existing-ebay-epn");
  });
});

describe("affiliate monetization picker", () => {
  it("routes POP MART figure to eBay/EPN", () => {
    const route = pickAffiliateMonetizationPath({ name: "Labubu figure", brand: "POP MART" });
    assert.equal(route.monetizationPath, "existing-ebay-epn");
    assert.equal(route.validation, "EPN");
  });

  it("routes Sonny Angel figure to eBay/EPN", () => {
    const route = pickAffiliateMonetizationPath({ name: "Sonny Angel figure", brand: "Sonny Angel" });
    assert.equal(route.monetizationPath, "existing-ebay-epn");
  });

  it("routes Smiski figure to eBay/EPN", () => {
    const route = pickAffiliateMonetizationPath({ name: "Smiski figure", brand: "Smiski" });
    assert.equal(route.monetizationPath, "existing-ebay-epn");
  });

  it("routes display case to Amazon Associates with exact tag", () => {
    const route = pickAffiliateMonetizationPath({ name: "Display case" });
    const url = new URL(route.destinationUrl);
    assert.equal(route.monetizationPath, "amazon-associates");
    assert.equal(url.origin, "https://www.amazon.com");
    assert.equal(url.searchParams.get("tag"), AMAZON_ASSOCIATE_TAG);
  });

  it("routes protective case to Amazon Associates", () => {
    const route = pickAffiliateMonetizationPath({ name: "Protective case for blind-box figures" });
    assert.equal(route.monetizationPath, "amazon-associates");
  });

  it("routes storage accessory to Amazon Associates", () => {
    const route = pickAffiliateMonetizationPath({ name: "Collector storage accessory organizer" });
    assert.equal(route.monetizationPath, "amazon-associates");
  });

  it("routes unknown products to NONE", () => {
    const route = pickAffiliateMonetizationPath({ name: "Mystery collector thing" });
    assert.equal(route.monetizationPath, "NONE");
    assert.equal(route.validation, "NONE");
  });

  it("routes ambiguous products to NONE", () => {
    const route = pickAffiliateMonetizationPath({ name: "Labubu display case figure stand bundle", brand: "POP MART" });
    assert.equal(route.monetizationPath, "NONE");
  });

  it("keeps existing eBay tracking architecture unchanged", () => {
    const ebay = new URL(buildEbaySearchUrl({
      query: "POP MART Labubu",
      kind: "active",
      campid: "5339171775",
      customId: "cid123",
    }));
    assert.match(ebay.hostname, /(?:^|\.)ebay\.com$/i);
    assert.equal(ebay.searchParams.get("campid"), "5339171775");
    assert.equal(ebay.searchParams.get("customid"), "cid123");
  });

  it("uses direct Amazon links instead of EPN redirects", () => {
    const route = pickAffiliateMonetizationPath({ name: "Display stand" });
    const url = new URL(route.destinationUrl);
    assert.equal(route.monetizationPath, "amazon-associates");
    assert.equal(url.hostname, "www.amazon.com");
    assert.doesNotMatch(url.pathname, /^\/api\/out\/(?:ebay|offer|ebay-live|amazon)/i);
    assert.equal(assertAffiliatePathValidation({ affiliatePath: route }), true);
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
