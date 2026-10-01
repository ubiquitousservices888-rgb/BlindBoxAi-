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

test("rejects missing completed-sale evidence and under-sampled opportunities", () => {
  assert.equal(scoreCollectibleOpportunity({ ...verified, completedSaleEvidence: false }).eligible, false);
  const result = scoreCollectibleOpportunity({ ...verified, soldSampleCount: 1 });
  assert.equal(result.eligible, false);
  assert.equal(result.score, null);
});

test("rejects unverified affiliate economics and single-source conclusions", () => {
  assert.equal(scoreCollectibleOpportunity({ ...verified, affiliateEconomicsVerified: false }).eligible, false);
  assert.equal(scoreCollectibleOpportunity({ ...verified, singleSourceConclusion: true }).eligible, false);
  assert.equal(scoreCollectibleOpportunity({ ...verified, singleSourceConclusion: undefined }).eligible, false);
});

test("treats null, blank, and omitted factors as missing", () => {
  for (const value of [null, "", "   ", undefined]) {
    const result = scoreCollectibleOpportunity({ ...verified, buyerIntent: value });
    assert.equal(result.eligible, false);
    assert.match(result.rejectReasons.join(" "), /missing score factors: buyerIntent/);
  }
});

test("rejects non-finite completed-sale sample counts", () => {
  const result = scoreCollectibleOpportunity({ ...verified, soldSampleCount: Infinity });
  assert.equal(result.eligible, false);
  assert.equal(result.soldSampleCount, 0);
});

test("geometric score remains monotonic at the zero boundary", () => {
  const zero = scoreCollectibleOpportunity({ ...verified, buyerIntent: 0 });
  const one = scoreCollectibleOpportunity({ ...verified, buyerIntent: 1 });
  const two = scoreCollectibleOpportunity({ ...verified, buyerIntent: 2 });
  assert.equal(zero.score, 0);
  assert.ok(one.score > zero.score);
  assert.ok(two.score > one.score);
});

test("ranks eligible opportunities highest score first", () => {
  const ranked = rankCollectibleOpportunities([
    { id: "lower", ...verified, buyerIntent: 55 },
    { id: "higher", ...verified, buyerIntent: 95 },
    { id: "rejected", ...verified, soldSampleCount: 0 },
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["higher", "lower"]);
});
