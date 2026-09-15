import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAffiliateEligibility } from "../lib/market-eligibility.mjs";

function seriesWithEvidence(evidence) {
  return {
    slug: "regression-series",
    figures: [{
      name: "Regression Figure",
      rarity: "common",
      resaleLow: 19.49,
      resaleHigh: 19.49,
      needsReview: false,
      evidence,
    }],
  };
}

test("one completed sale is never verified", () => {
  const result = evaluateAffiliateEligibility(seriesWithEvidence(
    "Reviewed eBay completed transaction: item 157991763193 sold 2026-07-26 for USD 19.49.",
  ));
  assert.equal(result.eligible, false);
  assert.equal(result.verifiedMarketRecordCount, 0);
});

test("two documented completed sales can be verified", () => {
  const result = evaluateAffiliateEligibility(seriesWithEvidence(
    "2 firm US sales Jul 20 and Jul 22 2026: $19.49 and $19.49.",
  ));
  assert.equal(result.eligible, true);
  assert.equal(result.verifiedMarketRecordCount, 1);
  assert.equal(result.verifiedMarketRecords[0].completedSaleCount, 2);
});
