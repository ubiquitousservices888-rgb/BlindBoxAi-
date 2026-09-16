import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seriesPage = readFileSync(new URL("../app/series/[slug]/page.jsx", import.meta.url), "utf8");

test("series page carries utm_source into server-rendered affiliate links", () => {
  assert.match(seriesPage, /normalizeSource\(query\?\.source \|\| query\?\.utm_source\)/);
  assert.match(seriesPage, /ebayOutboundPath\(s\.slug, f\.name, "sold", attribution\)/);
  assert.match(seriesPage, /ebayOutboundPath\(s\.slug, f\.name, "active", attribution\)/);
  assert.match(seriesPage, /<LiveEbayListings seriesSlug=\{s\.slug\} campaignId=\{campaignId\} source=\{source\} \/>/);
});
