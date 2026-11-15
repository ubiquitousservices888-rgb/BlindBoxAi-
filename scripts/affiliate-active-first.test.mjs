import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/series/[slug]/page.jsx", import.meta.url), "utf8");

test("active merchant listing CTA precedes historical sold-price research for a buyer", () => {
  const active = page.indexOf('ebayOutboundPath(s.slug, f.name, "active"');
  const sold = page.indexOf('ebayOutboundPath(s.slug, f.name, "sold"');
  assert.ok(active >= 0, "active listings merchant CTA exists");
  assert.ok(sold > active, "active purchasable listings are above completed-sale research");
  assert.match(page, /Shop active listings on eBay/);
  assert.match(page, /Check completed sales on eBay/);
});

test("commercial CTA keeps on-site helpful research and clear disclosure", () => {
  assert.match(page, /Disclosure: As an eBay Partner, BlindBoxAI may earn a commission from qualifying purchases/);
  assert.match(page, /Reviews|Resale prices|completed sales/i);
  assert.match(page, /href=\{ebayOutboundPath\(s.slug, f.name, "active", attribution\)\}/);
  assert.match(page, /href=\{ebayOutboundPath\(s.slug, f.name, "sold", attribution\)\}/);
  assert.match(page, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(page, /guaranteed commission|guaranteed resale|buy now for guaranteed value/i);
});
