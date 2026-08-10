import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLOSURE,
  assertArtifactIsSecretFree,
  assertProductionContext,
  buildEligibleProduct,
  candidateHash,
  channelsNeedingPublish,
  createCandidate,
  emptyState,
  finalizeProductState,
  findExistingBufferPost,
  markStaged,
  selectNextProduct,
  updatePublicationState,
  validateCandidateHash,
  validatePublishableText,
  verifyEnvironmentGate,
  verifyLiveUrl,
} from "../lib/daily-product-pipeline.mjs";

function series(slug, overrides = {}) {
  return {
    slug,
    name: `Series ${slug}`,
    brand: "POP MART",
    retailUSD: 999,
    pullOdds: { secret: "1/1" },
    figures: [{ name: "UNVERIFIED SECRET", rarity: "secret", needsReview: true }],
    checklist: ["UNVERIFIED AUTH CLAIM"],
    _dataQuality: {
      retailUSD: { status: "unverified", source: null, checked_at: null },
      pullOdds: { status: "unverified", source: null, checked_at: null },
    },
    ...overrides,
  };
}

describe("daily product selection", () => {
  it("selects exactly one new eligible product and excludes STAGED/PUBLISHED", () => {
    const state = { products: { a: { status: "STAGED" }, b: { status: "PUBLISHED" } } };
    const selected = selectNextProduct([series("a"), series("b"), series("c"), series("d")], state);
    assert.equal(selected.productId, "c");
  });
  it("returns null instead of repeating when all candidates are already used", () => {
    const state = { products: { a: { status: "PUBLISHED" }, b: { status: "STAGED" } } };
    assert.equal(selectNextProduct([series("a"), series("b")], state), null);
  });
  it("rejects placeholder identity fields", () => {
    assert.throws(() => buildEligibleProduct(series("x", { name: "REPLACE_PRODUCT" })), /placeholder/i);
  });
});

describe("fact safety and candidate integrity", () => {
  it("does not emit unverified price, odds, figure names, or auth claims", () => {
    const product = buildEligibleProduct(series("safe-product"));
    assert.deepEqual(product.facts, []);
    const candidate = createCandidate(product, { runId: "1", sourceCommit: "abc" });
    const allText = Object.values(candidate.captions).join("\n");
    assert.ok(!allText.includes("999"));
    assert.ok(!allText.includes("1/1"));
    assert.ok(!allText.includes("UNVERIFIED SECRET"));
    assert.ok(!allText.includes("UNVERIFIED AUTH CLAIM"));
    assert.ok(Object.values(candidate.captions).every((text) => text.includes(DISCLOSURE)));
  });
  it("detects artifact tampering", () => {
    const candidate = createCandidate(buildEligibleProduct(series("hash-test")), { runId: "2" });
    assert.equal(candidate.candidateHash, candidateHash(candidate));
    assert.equal(validateCandidateHash(candidate), true);
    candidate.name = "tampered";
    assert.throws(() => validateCandidateHash(candidate), /hash mismatch/i);
  });
  it("fails publishable text without disclosure", () => {
    assert.throws(() => validatePublishableText("BlindBoxAI guide https://www.blindboxai.com/series/x"), /disclosure/i);
  });
  it("keeps secret-like values out of artifacts", () => {
    const candidate = createCandidate(buildEligibleProduct(series("secret-test")), { runId: "3" });
    assert.equal(assertArtifactIsSecretFree(candidate), true);
    assert.throws(() => assertArtifactIsSecretFree({ token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890" }), /secret/i);
  });
});

describe("live gates", () => {
  it("fails a dead CTA", async () => {
    const fetchImpl = async () => new Response("no", { status: 404, headers: { "content-type": "text/html" } });
    await assert.rejects(() => verifyLiveUrl("https://www.blindboxai.com/series/dead", { fetchImpl }), /404/);
  });
  it("requires production environment and Buffer token", () => {
    assert.throws(() => assertProductionContext({ token: null, environmentName: "social-production" }), /BUFFER_API_TOKEN/);
    assert.throws(() => assertProductionContext({ token: "x", environmentName: "staging" }), /social-production/);
    assert.equal(assertProductionContext({ token: "x", environmentName: "social-production" }), true);
  });
  it("fails closed unless social-production requires the repository owner as reviewer", async () => {
    const okFetch = async () => new Response(JSON.stringify({
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "ubiquitousservices888-rgb" } }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const badFetch = async () => new Response(JSON.stringify({ protection_rules: [] }), { status: 200, headers: { "content-type": "application/json" } });
    assert.equal(await verifyEnvironmentGate({ repo: "owner/repo", token: "token", expectedReviewer: "ubiquitousservices888-rgb", fetchImpl: okFetch }), true);
    await assert.rejects(() => verifyEnvironmentGate({ repo: "owner/repo", token: "token", expectedReviewer: "ubiquitousservices888-rgb", fetchImpl: badFetch }), /must require approval/);
  });
});

describe("idempotent publishing state", () => {
  it("detects an existing exact Buffer post instead of creating a duplicate", async () => {
    const fetchImpl = async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.match(request.query, /query Existing/);
      return new Response(JSON.stringify({
        data: { posts: { edges: [{ node: { id: "post-123", text: "exact caption", status: "scheduled", channelId: "chan-1", createdAt: new Date().toISOString() } }] } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const found = await findExistingBufferPost({ token: "test-token", organizationId: "org-1", channelId: "chan-1", text: "exact caption", fetchImpl });
    assert.equal(found.id, "post-123");
  });
  it("retries only channels that are not already published", () => {
    const candidate = createCandidate(buildEligibleProduct(series("retry")), { runId: "4" });
    let state = markStaged(emptyState(), candidate);
    const channels = [
      { id: "a", service: "twitter", name: "A" },
      { id: "b", service: "facebook", name: "B" },
    ];
    state = updatePublicationState(state, candidate, channels[0], { status: "published", externalId: "p1", error: null });
    state = updatePublicationState(state, candidate, channels[1], { status: "failed", externalId: null, error: "temporary" });
    assert.deepEqual(channelsNeedingPublish(state, candidate, channels).map((c) => c.id), ["b"]);
    state = finalizeProductState(state, candidate, channels);
    assert.equal(state.products.retry.status, "PARTIAL");
  });
});

describe("social-card contract", () => {
  it("uses a stable public social-card URL derived from the series slug", () => {
    const product = buildEligibleProduct(series("card-product"));
    assert.equal(product.graphicUrl, "https://www.blindboxai.com/api/social-card/card-product");
  });
});
