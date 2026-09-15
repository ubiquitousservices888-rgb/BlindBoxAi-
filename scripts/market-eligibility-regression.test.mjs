import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAffiliateEligibility, PUBLIC_PRICE_FRESHNESS_DAYS } from "../lib/market-eligibility.mjs";

const now = new Date("2026-09-15T12:00:00.000Z");

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
  ), { now });
  assert.equal(result.eligible, false);
  assert.equal(result.verifiedMarketRecordCount, 0);
});

test("two documented completed sales remain verified but old price evidence is dated", () => {
  const result = evaluateAffiliateEligibility(seriesWithEvidence(
    "2 firm US sales Jul 20 and Jul 22 2026: $19.49 and $19.49.",
  ), { now });
  assert.equal(result.eligible, true);
  assert.equal(result.verifiedMarketRecordCount, 1);
  assert.equal(result.verifiedMarketRecords[0].completedSaleCount, 2);
  assert.equal(result.verifiedMarketRecords[0].latestSaleAt, "2026-07-22");
  assert.equal(result.verifiedMarketRecords[0].freshnessStatus, "dated");
  assert.equal(result.verifiedMarketRecords[0].fresh, false);
  assert.equal(result.verifiedMarketRecords[0].freshnessWindowDays, PUBLIC_PRICE_FRESHNESS_DAYS);
});

test("recent completed-sale evidence is fresh inside the 30-day window", () => {
  const result = evaluateAffiliateEligibility(seriesWithEvidence(
    "2 firm US sales Sep 10 and Sep 12 2026: $19.49 and $21.00.",
  ), { now });
  assert.equal(result.eligible, true);
  assert.equal(result.verifiedMarketRecords[0].latestSaleAt, "2026-09-12");
  assert.equal(result.verifiedMarketRecords[0].freshnessStatus, "fresh");
  assert.equal(result.verifiedMarketRecords[0].fresh, true);
  assert.equal(result.verifiedMarketRecords[0].ageDays, 3);
});

test("verified sales with no defensible year keep freshness unknown", () => {
  const result = evaluateAffiliateEligibility(seriesWithEvidence(
    "2 US sales: $19.49 BIN (Jul 21) and $18.00 auction (Jun 8).",
  ), { now });
  assert.equal(result.eligible, true);
  assert.equal(result.verifiedMarketRecords[0].latestSaleAt, null);
  assert.equal(result.verifiedMarketRecords[0].freshnessStatus, "unknown");
  assert.equal(result.verifiedMarketRecords[0].fresh, false);
});
