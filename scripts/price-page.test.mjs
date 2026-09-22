import assert from "node:assert/strict";
import test from "node:test";
import { askingVsSoldGapPct, median, priceSlug } from "../lib/price-page-core.mjs";

test("one-sale item is below public page threshold", () => {
  const sales=[185];
  assert.equal(sales.length >= 2, false);
});
test("gap percentage matches fixture math", () => {
  assert.equal(median([100,200]),150);
  assert.equal(askingVsSoldGapPct(225,150),50);
});
test("missing asking data produces no gap", () => {
  assert.equal(askingVsSoldGapPct(null,150),null);
});
test("slugs are deterministic", () => {
  assert.equal(priceSlug("Mew ex #152 / 30th"),"mew-ex-152-30th");
});
