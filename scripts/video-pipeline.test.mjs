import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURE, STATES, approve, createRenderRecord, generateVideoScript, markRendered, publishApproved, reject, selectDailyProduct, validateVerifiedProduct } from "../lib/video-pipeline.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");
const product = { id: "verified-one", name: "Verified One", productUrl: "https://blindboxai.com/series/verified-one", sources: [{ id: "official", url: "https://brand.example/products/one", checkedAt: "2026-08-08T12:00:00.000Z", status: "verified" }], claims: [{ text: "The official listing names this series Verified One.", sourceId: "official" }] };
const ready = () => markRendered(createRenderRecord(product, generateVideoScript(product, now), ["tiktok", "instagram"], now), { id: "render-1", videoUrl: "https://cdn.example/video.mp4" }, now);

describe("verified-data gate", () => {
  it("rejects unsourced claims", () => assert.throws(() => validateVerifiedProduct({ ...product, claims: [{ text: "invented" }] }, now)));
  it("rejects stale sources", () => assert.throws(() => validateVerifiedProduct({ ...product, sources: [{ ...product.sources[0], checkedAt: "2026-01-01T00:00:00.000Z" }] }, now)));
  it("fails daily selection closed when none qualify", () => assert.throws(() => selectDailyProduct([], now)));
  it("generates only sourced facts and disclosure", () => { const script = generateVideoScript(product, now); assert.deepEqual(script.facts, [product.claims[0].text]); assert.match(script.caption, new RegExp(DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); });
});

describe("render and manual review gates", () => {
  it("requires a hosted HTTPS MP4", () => assert.throws(() => markRendered(createRenderRecord(product, generateVideoScript(product, now), ["tiktok"], now), { id: "x", videoUrl: "file:///video.mp4" }, now)));
  it("cannot approve before READY_FOR_REVIEW", () => assert.throws(() => approve(createRenderRecord(product, generateVideoScript(product, now), ["tiktok"], now), now)));
  it("reject records cannot publish", async () => await assert.rejects(() => publishApproved(reject(ready(), "bad audio", now), async () => ({ id: "x" }), now)));
});

describe("safe publishing", () => {
  it("requires manual approval", async () => await assert.rejects(() => publishApproved(ready(), async () => ({ id: "x" }), now)));
  it("prevents duplicates and retries only failed channels", async () => { let calls = []; let first = true; const publisher = async ({ channel }) => { calls.push(channel); if (channel === "instagram" && first) throw new Error("temporary"); return { id: `${channel}-1` }; }; let state = await publishApproved(approve(ready(), now), publisher, now); assert.equal(state.state, STATES.PARTIAL); assert.deepEqual(calls, ["tiktok", "instagram"]); first = false; calls = []; state = await publishApproved(state, publisher, now); assert.equal(state.state, STATES.PUBLISHED); assert.deepEqual(calls, ["instagram"]); assert.equal(state.publications.tiktok.externalId, "tiktok-1"); });
});
