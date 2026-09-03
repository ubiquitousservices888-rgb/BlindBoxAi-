import test from "node:test";
import assert from "node:assert/strict";
import { assertVerifiedResaleMarket, verifyCollectibleMarket } from "../lib/collectible-price-verification.mjs";

const identity = {
  brand: "POP MART",
  series: "Twinkle Twinkle Farm Tales",
  item: "Tearful Duckling",
  condition: "sealed",
  edition: "standard",
};

const now = "2026-09-02T16:00:00.000Z";

function evidence(type, amount, source, trust = "marketplace_completed_sales") {
  return {
    type,
    amount,
    currency: "USD",
    source,
    sourceUrl: `https://example.test/${source}/${type}/${amount}`,
    trust,
    observedAt: "2026-09-02T12:00:00.000Z",
    identity: { ...identity },
  };
}

test("completed sales establish a verified resale market", () => {
  const result = verifyCollectibleMarket({
    identity,
    evidence: [
      evidence("sold", 42, "market-a"),
      evidence("sold", 48, "market-a"),
      evidence("active_ask", 99, "market-a", "marketplace_api"),
      evidence("msrp", 29.99, "official-store", "official"),
    ],
  }, { now });

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.soldMedianUSD, 45);
  assert.equal(result.currentLowestAskUSD, 99);
  assert.equal(result.officialMsrpUSD, 29.99);
  assert.equal(result.canClaimStrongResaleValue, true);
  assert.equal(assertVerifiedResaleMarket(result), true);
});

test("active asks never establish resale value", () => {
  const result = verifyCollectibleMarket({
    identity,
    evidence: [
      evidence("active_ask", 500, "market-a", "marketplace_api"),
      evidence("highest_bid", 35, "market-b", "marketplace_api"),
    ],
  }, { now });

  assert.equal(result.status, "CURRENT_MARKET_ONLY");
  assert.equal(result.canClaimResaleValue, false);
  assert.equal(result.soldMedianUSD, null);
  assert.throws(() => assertVerifiedResaleMarket(result));
});

test("stale sold evidence is rejected for current price claims", () => {
  const old = evidence("sold", 50, "market-a");
  old.observedAt = "2026-08-20T12:00:00.000Z";
  const result = verifyCollectibleMarket({ identity, evidence: [old] }, { now, maxAgeHours: 72 });
  assert.equal(result.status, "RESEARCH_ONLY");
  assert.equal(result.freshEvidenceCount, 0);
});

test("future-dated evidence is rejected", () => {
  const future = evidence("sold", 50, "market-a");
  future.observedAt = "2026-09-02T16:00:01.000Z";
  const result = verifyCollectibleMarket({ identity, evidence: [future] }, { now });
  assert.equal(result.validEvidenceCount, 0);
  assert.equal(result.freshEvidenceCount, 0);
  assert.equal(result.status, "RESEARCH_ONLY");
});

test("evidence identity is compared instead of trusting a boolean", () => {
  const bad = evidence("sold", 50, "market-a");
  bad.identity.item = "Different collectible";
  bad.exactIdentityMatch = true;
  const result = verifyCollectibleMarket({ identity, evidence: [bad] }, { now });
  assert.equal(result.validEvidenceCount, 0);
  assert.equal(result.evidence[0].exactIdentityMatch, false);
  assert.equal(result.status, "RESEARCH_ONLY");
});

test("evidence without comparable identity is rejected", () => {
  const missing = evidence("sold", 50, "market-a");
  delete missing.identity;
  const result = verifyCollectibleMarket({ identity, evidence: [missing] }, { now });
  assert.equal(result.validEvidenceCount, 0);
});

test("source URLs must use HTTPS", () => {
  const malformed = evidence("sold", 50, "market-a");
  malformed.sourceUrl = "not-a-url";
  const insecure = evidence("sold", 55, "market-a");
  insecure.sourceUrl = "http://example.test/sale";
  const result = verifyCollectibleMarket({ identity, evidence: [malformed, insecure] }, { now });
  assert.equal(result.validEvidenceCount, 0);
  assert.equal(result.status, "RESEARCH_ONLY");
});

test("unsafe verification options are clamped to fail-safe defaults", () => {
  const result = verifyCollectibleMarket({
    identity,
    evidence: [evidence("sold", 50, "market-a")],
  }, { now, maxAgeHours: -1, minSoldSamples: 1 });
  assert.equal(result.maxAgeHours, 72);
  assert.equal(result.status, "LOW_CONFIDENCE");
  assert.equal(result.canClaimStrongResaleValue, false);
});
