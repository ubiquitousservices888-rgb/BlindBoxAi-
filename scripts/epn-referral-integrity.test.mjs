import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReadonlyEbayOutboundTarget } from "../lib/ebay-outbound-readonly.mjs";
import { auditEpnUrl } from "../lib/affiliate-policy.mjs";
import { normalizeBlindBoxEpnCustomId } from "../lib/campaign-attribution.mjs";

const SERIES = {
  slug: "labubu-the-monsters-hair-salon",
  name: "THE MONSTERS Hair Salon",
  brand: "POP MART",
  figures: [{ name: "Blow Dry" }],
};
const base = "https://blindboxai.com/api/out/ebay?series=labubu-the-monsters-hair-salon&figure=Blow%20Dry&kind=active&placement=series_table&campaign=yt-fake-check&source=youtube";
const getSeriesFn = (slug) => slug === SERIES.slug ? SERIES : null;

function checkWithCampid(campid, url = base) {
  const saved = process.env.NEXT_PUBLIC_EPN_CAMPID;
  try {
    if (campid === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
    else process.env.NEXT_PUBLIC_EPN_CAMPID = campid;
    return resolveReadonlyEbayOutboundTarget({ requestUrl: url, getSeriesFn });
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
    else process.env.NEXT_PUBLIC_EPN_CAMPID = saved;
  }
}

test("missing and malformed EPN campaign settings cannot silently redirect as unpaid eBay traffic", () => {
  for (const bad of [undefined, "", "not-a-campaign", "123", "1234567890123456"]) {
    const result = checkWithCampid(bad);
    assert.equal(result.status, 503);
    assert.equal(result.target, null);
    assert.equal(result.reason, "epn-tracking-unavailable");
  }
});

test("valid campaign and figure create an independently auditable tracked eBay destination", () => {
  const result = checkWithCampid("5339171775");
  assert.equal(result.status, 302);
  assert.equal(result.kind, "active");
  assert.equal(result.campaignId, "yt-fake-check");
  const validation = auditEpnUrl(result.target, { kind: "active", requireTracking: true });
  assert.deepEqual(validation, { ok: true, reasons: [] });
  const parsed = new URL(result.target);
  assert.equal(parsed.searchParams.get("campid"), "5339171775");
  assert.equal(parsed.searchParams.get("customid"), result.customId);
  assert.equal(normalizeBlindBoxEpnCustomId(result.customId), result.customId);
  assert.ok(result.customId.includes("ytfakecheck"));
});

test("sold comparison is identified as research, and never loses campaign tracking silently", () => {
  const result = checkWithCampid("5339171775", base.replace("kind=active", "kind=sold"));
  assert.equal(result.status, 302);
  assert.equal(result.kind, "sold");
  assert.equal(new URL(result.target).searchParams.get("LH_Sold"), "1");
  assert.deepEqual(auditEpnUrl(result.target, { kind: "sold", requireTracking: true }), { ok: true, reasons: [] });
});

test("a tracked outbound route never creates a redirect or affiliate click receipt from an invalid config", () => {
  const route = readFileSync(new URL("../app/api/out/ebay/route.js", import.meta.url), "utf8");
  const bad = checkWithCampid(undefined);
  assert.equal(bad.target, null);
  assert.match(route, /if \(!resolved\.target\)/);
  assert.match(route, /epn-tracking-unavailable/);
  assert.match(route, /recordAffiliateClick/);
  assert.match(route, /NextResponse\.redirect\(target, 302\)/);
  assert.doesNotMatch(route, /fetch\(.*ebay\.com|fetch\(.*\/api\/out\/ebay/i);
});
