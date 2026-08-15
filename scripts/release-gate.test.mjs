import assert from "node:assert/strict";
import test from "node:test";

import {
  auditEpnUrl,
  buildEbaySearchUrl,
  shouldUseSkimlinks,
} from "../lib/affiliate-policy.mjs";

const campid = "5339000000";
const customId = "bb1sreleasegatefexamplekactivepseries";

test("Skimlinks excludes eBay and its subdomains", () => {
  assert.equal(shouldUseSkimlinks("https://ebay.com/sch/i.html?_nkw=labubu"), false);
  assert.equal(shouldUseSkimlinks("https://www.ebay.com/sch/i.html?_nkw=labubu"), false);
  assert.equal(shouldUseSkimlinks("https://deals.ebay.com/item"), false);
});

test("Skimlinks exclusion does not match lookalike hosts", () => {
  assert.equal(shouldUseSkimlinks("https://ebay.com.example.org/item"), true);
  assert.equal(shouldUseSkimlinks("https://example.org/ebay.com/item"), true);
});

test("active-listing EPN URL has tracking and no sold filters", () => {
  const url = buildEbaySearchUrl({ query: "Labubu", kind: "active", campid, customId });
  assert.deepEqual(auditEpnUrl(url, { kind: "active" }), { ok: true, reasons: [] });
  assert.equal(new URL(url).searchParams.has("LH_Sold"), false);
  assert.equal(new URL(url).searchParams.has("LH_Complete"), false);
});

test("sold-comps EPN URL is isolated from the active buyer path", () => {
  const url = buildEbaySearchUrl({ query: "Labubu", kind: "sold", campid, customId });
  assert.deepEqual(auditEpnUrl(url, { kind: "sold" }), { ok: true, reasons: [] });
  assert.equal(new URL(url).searchParams.get("LH_Sold"), "1");
  assert.equal(new URL(url).searchParams.get("LH_Complete"), "1");
});

test("untracked and malformed EPN URLs fail the release audit", () => {
  const untracked = buildEbaySearchUrl({ query: "Labubu", kind: "active" });
  assert.equal(auditEpnUrl(untracked, { kind: "active" }).ok, false);
  assert.throws(
    () => buildEbaySearchUrl({ query: "Labubu", kind: "active", campid: "replace-me", customId }),
    /campid/,
  );
});

test("EPN customid cannot exceed eBay's limit", () => {
  assert.throws(
    () => buildEbaySearchUrl({ query: "Labubu", kind: "active", campid, customId: "x".repeat(257) }),
    /customid/,
  );
});

