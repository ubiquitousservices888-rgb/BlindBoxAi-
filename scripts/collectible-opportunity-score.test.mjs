import assert from "node:assert/strict";
import test from "node:test";
import { rankCollectibleOpportunities, scoreCollectibleOpportunity } from "../lib/collectible-opportunity-score.mjs";

const verified = {
  buyerIntent: 80,
  transactionValue: 70,
  conversionOpportunity: 75,
  monetizationFit: 90,
  evidenceConfidence: 85,
  liquidity: 65,
  sellThrough: 70,
  completedSaleEvidence: true,
  soldSampleCount: 3,
  affiliateEconomicsVerified: true,
  singleSourceConclusion: false,
};

test("scores only evidence-qualified opportunities", () => {
  const result = scoreCollectibleOpportunity(verified);
  assert.equal(result.eligible, true);
  assert.ok(result.score > 0 && result.score <= 100);
});

test("rejects asking-price or under-sampled opportunities", () => {
  const result = scoreCollectibleOpportunity({ ...verified, soldSampleCount: 1 });
  assert.equal(result.eligible, false);
  assert.equal(result.score, null);
});

test("rejects unverified affiliate economics and single-source conclusions", () => {
  assert.equal(scoreCollectibleOpportunity({ ...verified, affiliateEconomicsVerified: false }).eligible, false);
  assert.equal(scoreCollectibleOpportunity({ ...verified, singleSourceConclusion: true }).eligible, false);
});

test("ranks eligible opportunities highest score first", () => {
  const ranked = rankCollectibleOpportunities([
    { id: "lower", ...verified, buyerIntent: 55 },
    { id: "higher", ...verified, buyerIntent: 95 },
    { id: "rejected", ...verified, soldSampleCount: 0 },
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["higher", "lower"]);
});
