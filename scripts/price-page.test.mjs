import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  askingVsSoldGapPct,
  hasPublicPriceEvidence,
  median,
  parsePriceSlug,
  priceSlug,
} from "../lib/price-page-core.mjs";

test("public price threshold requires two positive verified observations", () => {
  assert.equal(hasPublicPriceEvidence([{ amount: 185 }]), false);
  assert.equal(hasPublicPriceEvidence([{ amount: 185 }, { amount: 190 }]), true);
  assert.equal(hasPublicPriceEvidence([{ amount: null }, { amount: 190 }]), false);
});

test("median ignores missing, empty, non-finite, and non-positive values", () => {
  assert.equal(median([null, "", 0, -4, 100, 200, Number.NaN]), 150);
  assert.equal(median([null, "", 0]), null);
});

test("gap percentage preserves explicit no-data semantics", () => {
  assert.equal(askingVsSoldGapPct(225, 150), 50);
  assert.equal(askingVsSoldGapPct(null, 150), null);
  assert.equal(askingVsSoldGapPct(0, 150), null);
  assert.equal(askingVsSoldGapPct(225, 0), null);
});

test("slugs are stable, condition-specific, and parseable", () => {
  const raw = priceSlug({ canonicalName: "Mew ex #152 / 30th", id: "abc-123", conditionType: "raw" });
  const graded = priceSlug({ canonicalName: "Mew ex #152 / 30th", id: "abc-123", conditionType: "graded" });
  assert.notEqual(raw, graded);
  assert.deepEqual(parsePriceSlug(raw), { conditionType: "raw", id: "abc-123" });
  const longId = "a".repeat(64);
  assert.deepEqual(parsePriceSlug(priceSlug({ canonicalName: "Long ID", id: longId, conditionType: "graded" })), {
    conditionType: "graded",
    id: longId,
  });
  assert.deepEqual(parsePriceSlug(priceSlug({ canonicalName: "Pikachu", id: "ab--cd", conditionType: "raw" })), {
    conditionType: "raw",
    id: "ab-cd",
  });
});

test("slug normalization strips diacritics and has a non-Latin fallback", () => {
  assert.match(priceSlug({ canonicalName: "Naïve", id: "id-1", conditionType: "raw" }), /^naive--raw--id-1$/);
  assert.match(priceSlug({ canonicalName: "ポケモン", id: "id-2", conditionType: "raw" }), /^collectible--raw--id-2$/);
});

test("public price edge function batches data and keeps conditions separate", () => {
  const edge = fs.readFileSync(new URL("../supabase/functions/public-price-items/index.ts", import.meta.url), "utf8");
  assert.match(edge, /async function paged/);
  assert.match(edge, /condition_type/);
  assert.match(edge, /\.eq\("condition_type", conditionType\)/);
  assert.match(edge, /paged\(\s*"sold_price_observations"[\s\S]*\.order\("collectible_id"[\s\S]*\.order\("sold_at"[\s\S]*\.order\("id"/);
  assert.match(edge, /status >= 400 \? ERROR_HEADERS : SUCCESS_HEADERS/);
});

test("public page escapes JSON-LD and formats sale dates in UTC", () => {
  const page = fs.readFileSync(new URL("../app/price/[itemSlug]/page.jsx", import.meta.url), "utf8");
  assert.match(page, /replace\(\/<\/g, "\\\\u003c"\)/);
  assert.match(page, /timeZone: "UTC"/);
  assert.match(page, /Condition:/);
});
