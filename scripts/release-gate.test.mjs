import assert from "node:assert/strict";
import test from "node:test";

import {
  auditEpnUrl,
  buildEbaySearchUrl,
  shouldUseSkimlinks,
} from "../lib/affiliate-policy.mjs";

const campid = "5339000000";
const customId = "bb1sreleasegatefexamplekactivepseries";
const collectibleQueries = [
  "POP MART Labubu",
  "POP MART HIRONO",
  "POP MART SKULLPANDA",
  "SMISKI Series 1",
  "tokidoki Unicorno",
];

test("Skimlinks excludes eBay and its subdomains", () => {
  assert.equal(shouldUseSkimlinks("https://ebay.com/sch/i.html?_nkw=blind+box"), false);
  assert.equal(shouldUseSkimlinks("https://www.ebay.com/sch/i.html?_nkw=blind+box"), false);
  assert.equal(shouldUseSkimlinks("https://deals.ebay.com/item"), false);
});

test("Skimlinks exclusion does not match lookalike hosts", () => {
  assert.equal(shouldUseSkimlinks("https://ebay.com.example.org/item"), true);
  assert.equal(shouldUseSkimlinks("https://example.org/ebay.com/item"), true);
});

test("active-listing EPN URL has tracking and no sold filters", () => {
  for (const query of collectibleQueries) {
    const url = buildEbaySearchUrl({ query, kind: "active", campid, customId });
    assert.deepEqual(auditEpnUrl(url, { kind: "active" }), { ok: true, reasons: [] });
    assert.equal(new URL(url).searchParams.has("LH_Sold"), false);
    assert.equal(new URL(url).searchParams.has("LH_Complete"), false);
  }
});

test("sold-comps EPN URL is isolated from the active buyer path", () => {
  for (const query of collectibleQueries) {
    const url = buildEbaySearchUrl({ query, kind: "sold", campid, customId });
    assert.deepEqual(auditEpnUrl(url, { kind: "sold" }), { ok: true, reasons: [] });
    assert.equal(new URL(url).searchParams.get("LH_Sold"), "1");
    assert.equal(new URL(url).searchParams.get("LH_Complete"), "1");
  }
});

test("untracked and malformed EPN URLs fail the release audit", () => {
  const untracked = buildEbaySearchUrl({ query: "tokidoki Unicorno", kind: "active" });
  assert.equal(auditEpnUrl(untracked, { kind: "active" }).ok, false);
  assert.throws(
    () => buildEbaySearchUrl({ query: "SMISKI", kind: "active", campid: "replace-me", customId }),
    /campid/,
  );
});

test("EPN customid cannot exceed eBay's limit", () => {
  assert.throws(
    () => buildEbaySearchUrl({ query: "POP MART HIRONO", kind: "active", campid, customId: "x".repeat(257) }),
    /customid/,
  );
});
