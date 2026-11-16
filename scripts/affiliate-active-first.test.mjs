import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/series/[slug]/page.jsx", import.meta.url), "utf8");

test("the paired active offer anchor precedes the paired sold-research anchor", () => {
  const block = page.match(/<div style=\{\{ display: "flex", flexDirection: "column", gap: "6px" \}\}>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(block, "the two merchant CTAs must share a table-cell container");
  assert.equal(block.match(/<a className="ebay"/g)?.length, 2);
  const active = block.search(/<a className="ebay" href=\{ebayOutboundPath\(s\.slug, f\.name, "active", attribution\)\} target="_blank" rel="sponsored nofollow noopener">\s*Shop active listings on eBay ↗\s*<\/a>/);
  const sold = block.search(/<a className="ebay" href=\{ebayOutboundPath\(s\.slug, f\.name, "sold", attribution\)\} target="_blank" rel="sponsored nofollow noopener">\s*Check completed sales on eBay ↗\s*<\/a>/);
  assert.ok(active >= 0, "complete active link and label exist together");
  assert.ok(sold >= 0, "complete sold-research link and label exist together");
  assert.ok(active < sold, "the actual shop anchor comes before the sold-comparison anchor");
});

test("on-site sold evidence stays visible independently of merchant buttons", () => {
  assert.match(page, /<h2>Resale prices <span className="k">US-SOLD<\/span><\/h2>/);
  assert.match(page, /<table className="ptable">/);
  assert.match(page, /marketRecord\.completedSaleCount/);
  assert.match(page, />Evidence note<\/summary>/);
});

test("affiliate disclosure and honest value claims remain intact", () => {
  assert.match(page, /Disclosure: As an eBay Partner, BlindBoxAI may earn a commission from qualifying purchases/);
  assert.match(page, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(page, /\bguarantee(?:d|s)?\s+(?:value|profit|returns?|income|commission|resale|earnings?)\b|\b(?:risk[- ]free|100% guaranteed)\s+(?:profit|return|value)\b|\bbuy now for guaranteed value\b/i);
});
