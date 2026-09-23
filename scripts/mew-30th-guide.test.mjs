import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  MEW_30TH_CARDS,
  MEW_30TH_CHECKED_AT,
  mew30thOutboundPath,
  mew30thSummary,
} from "../lib/mew-30th-comparison.mjs";

test("Mew 30th comparison uses reproducible completed-sale samples", () => {
  assert.equal(MEW_30TH_CHECKED_AT, "2026-09-23");
  const card152 = MEW_30TH_CARDS.find((card) => card.key === "152");
  const card158 = MEW_30TH_CARDS.find((card) => card.key === "158");
  assert.ok(card152);
  assert.ok(card158);

  assert.deepEqual(
    mew30thSummary(card152),
    {
      completedSaleCount: 6,
      median: 179.5,
      low: 165,
      high: 200,
      latestSaleAt: "2026-09-22",
    },
  );
  assert.deepEqual(
    mew30thSummary(card158),
    {
      completedSaleCount: 6,
      median: 120,
      low: 100,
      high: 159.99,
      latestSaleAt: "2026-09-22",
    },
  );
});

test("Mew guide keeps each marketplace CTA behind BlindBoxAI", () => {
  for (const card of MEW_30TH_CARDS) {
    const path = mew30thOutboundPath(card);
    assert.match(path, /^\/api\/out\/price-item\?/);
    assert.match(path, /source=mew_30th_guide/);
    assert.doesNotMatch(path, /ebay\.com/i);
  }
});

test("Mew guide includes safety wording, disclosure, and no seller identifiers", () => {
  const page = fs.readFileSync(new URL("../app/guides/mew-ex-152-vs-158/page.jsx", import.meta.url), "utf8");
  assert.match(page, /Possible listing mismatch/);
  assert.match(page, /does not prove deception/);
  assert.match(page, /Affiliate disclosure:/);
  assert.match(page, /Prices as of/);
  assert.doesNotMatch(page, /scam/i);
  assert.doesNotMatch(page, /seller username/i);
  assert.doesNotMatch(page, /ebay\.com\/itm/i);
});

test("Mew identifiers stay distinct", () => {
  const card152 = MEW_30TH_CARDS.find((card) => card.key === "152");
  const card158 = MEW_30TH_CARDS.find((card) => card.key === "158");
  assert.equal(card152.number, "152/128");
  assert.equal(card152.rarity, "Special Illustration Rare");
  assert.equal(card152.illustrator, "Kuroimori");
  assert.equal(card158.number, "158/128");
  assert.equal(card158.rarity, "Futuristic Rare");
  assert.equal(card158.illustrator, "YOSHIROTTEN");
});
