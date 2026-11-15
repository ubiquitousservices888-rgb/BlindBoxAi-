import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveReadonlyEbayOutboundTarget } from "../lib/ebay-outbound-readonly.mjs";
import { auditEpnUrl } from "../lib/affiliate-policy.mjs";
import { normalizeEbayBrowseItem, getEbayProductionItem, resetEbayTokenCacheForTests } from "../lib/ebay-production-api.mjs";
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

test("classic outbound route source keeps error path separate from redirect and recording", () => {
  const route = readFileSync(new URL("../app/api/out/ebay/route.js", import.meta.url), "utf8");
  const bad = checkWithCampid(undefined);
  assert.equal(bad.target, null);
  assert.match(route, /if \(!resolved\.target\)/);
  assert.match(route, /epn-tracking-unavailable/);
  assert.match(route, /recordAffiliateClick/);
  assert.match(route, /NextResponse\.redirect\(target, 302\)/);
  assert.doesNotMatch(route, /fetch\(.*ebay\.com|fetch\(.*\/api\/out\/ebay/i);
});


const validBrowseUrl = "https://www.ebay.com/itm/123?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339171775&toolid=10001&customid=bb-live-test";

test("live Browse URLs must have matching campaign and Custom ID, not just an eBay host", () => {
  const sample = { itemId: "v1|123|0", title: "Fixture only", itemAffiliateWebUrl: validBrowseUrl };
  const options = { expectedCampid: "5339171775", expectedReferenceId: "bb-live-test" };
  assert.equal(normalizeEbayBrowseItem(sample, options)?.affiliateUrl, validBrowseUrl);
  const bad = [
    "https://www.ebay.com/itm/123",
    "https://www.ebay.com/itm/123?campid=5339171775",
    validBrowseUrl.replace("campid=5339171775", "campid=5555555555"),
    validBrowseUrl.replace("customid=bb-live-test", "customid=some-other-site"),
    validBrowseUrl.replace("mkevt=1", "mkevt=2"),
    validBrowseUrl.replace("mkcid=1", "mkcid=2"),
    validBrowseUrl.replace("toolid=10001", "toolid=bad"),
    validBrowseUrl.replace("toolid=10001", "toolid=20002"),
    validBrowseUrl.replace("mkrid=711-53200-19255-0", "mkrid=711-99999-99999-0"),
    validBrowseUrl.replace("/itm/123?", "/itm/999?"),
    validBrowseUrl.replace("https://www.ebay.com/", "https://www.ebay.com.attacker.example/"),
    validBrowseUrl.replace("https://www.ebay.com/", "https://user@www.ebay.com/"),
  ];
  for (const candidate of bad) {
    assert.equal(normalizeEbayBrowseItem({ ...sample, itemAffiliateWebUrl: candidate }, options), null, candidate);
  }
  assert.equal(normalizeEbayBrowseItem({ ...sample, itemId: "v1|999|0" }, options), null);
  assert.equal(normalizeEbayBrowseItem({ ...sample, itemId: "not-an-ebay-id" }, options), null);
});

test("valid 19-digit eBay Browse listing IDs are matched exactly, not dropped or misrouted", () => {
  const largeId = "1234567890123456789";
  const affiliateUrl = "https://www.ebay.com/itm/" + largeId +
    "?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339171775&toolid=10001&customid=bb-live-test";
  const options = { expectedCampid: "5339171775", expectedReferenceId: "bb-live-test" };
  const item = { itemId: "v1|" + largeId + "|0", title: "19-digit sample", itemAffiliateWebUrl: affiliateUrl };
  assert.equal(normalizeEbayBrowseItem(item, options)?.affiliateUrl, affiliateUrl);
  assert.equal(normalizeEbayBrowseItem({ ...item, itemId: "v1|1234567890123456788|0" }, options), null);
  assert.equal(normalizeEbayBrowseItem({ ...item, itemAffiliateWebUrl: affiliateUrl.replace(largeId, "1234567890123456788") }, options), null);
});

test("live API keeps expected campaign and reference across the provider response (offline fixtures)", async () => {
  const env = {
    EBAY_CLIENT_ID: "fixture-id",
    EBAY_CLIENT_SECRET: "fixture-secret",
    NEXT_PUBLIC_EPN_CAMPID: "5339171775",
  };
  const calls = [];
  const fetchImpl = async (uri, init) => {
    calls.push({ path: String(uri).split("?")[0], method: init.method || "GET",
      campaignHeader: init.headers?.["X-EBAY-C-ENDUSERCTX"] || "" });
    if (String(uri).includes("/oauth2/token")) {
      return Response.json({ access_token: "fixture", expires_in: 3600 });
    }
    return Response.json({ itemId: "v1|123|0", title: "Fixture only",
      itemAffiliateWebUrl: validBrowseUrl });
  };
  resetEbayTokenCacheForTests();
  const item = await getEbayProductionItem({ itemId: "v1|123|0", affiliateReferenceId: "bb-live-test", env, fetchImpl });
  assert.equal(item.affiliateUrl, validBrowseUrl);
  assert.match(calls[1].campaignHeader, /affiliateCampaignId=5339171775,affiliateReferenceId=bb-live-test/);

  resetEbayTokenCacheForTests();
  const badFetch = async (uri, init) => {
    if (String(uri).includes("/oauth2/token")) return Response.json({ access_token: "fixture", expires_in: 3600 });
    return Response.json({ itemId: "v1|123|0", title: "Fixture only",
      itemAffiliateWebUrl: validBrowseUrl.replace("customid=bb-live-test", "customid=wrong") });
  };
  await assert.rejects(
    getEbayProductionItem({ itemId: "v1|123|0", affiliateReferenceId: "bb-live-test", env, fetchImpl: badFetch }),
    /affiliate destination/i,
  );
  resetEbayTokenCacheForTests();
});
