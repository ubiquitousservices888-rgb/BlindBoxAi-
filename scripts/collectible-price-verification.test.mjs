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
    exactIdentityMatch: true,
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

test("identity mismatch evidence is excluded", () => {
  const bad = evidence("sold", 50, "market-a");
  bad.exactIdentityMatch = false;
  const result = verifyCollectibleMarket({ identity, evidence: [bad] }, { now });
  assert.equal(result.validEvidenceCount, 0);
  assert.equal(result.status, "RESEARCH_ONLY");
});
