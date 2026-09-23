import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { classifyEbayAffiliateRequest } from "../app/api/out/ebay-quality.mjs";
import { buildEbaySearchUrl, isEbayHostname } from "../lib/affiliate-policy.mjs";
import { ebayActiveLink } from "../lib/data.js";
import { normalizeEbayBrowseItem } from "../lib/ebay-production-api.mjs";

const CAMPID = "5339171775";

function request() {
  return {
    method: "GET",
    headers: { get() { return "Mozilla/5.0"; } },
  };
}

function throwingClassifier() {
  throw new Error("classifier unavailable");
}

function assertFallback() {
  assert.deepEqual(
    classifyEbayAffiliateRequest(request(), throwingClassifier),
    { clientClass: "unclassified", qualityReason: "classifier_error" },
  );
}

function assertEpnTarget(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.equal(isEbayHostname(url.hostname), true);
  assert.equal(url.searchParams.get("campid"), CAMPID);
}

const routeCases = [
  {
    name: "series eBay route",
    path: "../app/api/out/ebay/route.js",
    redirectPattern: /NextResponse\.redirect\(target, 302\)/,
    buildTarget() {
      const prior = process.env.NEXT_PUBLIC_EPN_CAMPID;
      process.env.NEXT_PUBLIC_EPN_CAMPID = CAMPID;
      try {
        return ebayActiveLink("POP MART Labubu", "quality-test");
      } finally {
        if (prior === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
        else process.env.NEXT_PUBLIC_EPN_CAMPID = prior;
      }
    },
  },
  {
    name: "buy-or-pass offer route",
    path: "../app/api/out/offer/route.js",
    redirectPattern: /NextResponse\.redirect\(target, 302\)/,
    buildTarget() {
      return buildEbaySearchUrl({
        query: "verified collectible",
        kind: "active",
        customId: "quality-test",
        campid: CAMPID,
      });
    },
  },
  {
    name: "live eBay item route",
    path: "../app/api/out/ebay-live/route.js",
    redirectPattern: /NextResponse\.redirect\(item\.affiliateUrl, 302\)/,
    buildTarget() {
      return normalizeEbayBrowseItem({
        itemId: "v1|123|0",
        title: "Verified item",
        itemAffiliateWebUrl: `https://www.ebay.com/itm/123?mkcid=1&campid=${CAMPID}`,
      })?.affiliateUrl;
    },
  },
  {
    name: "owner-card eBay route",
    path: "../app/api/out/owner-card/route.js",
    redirectPattern: /NextResponse\.redirect\(item\.affiliateUrl, 302\)/,
    buildTarget() {
      return normalizeEbayBrowseItem({
        itemId: "v1|456|0",
        title: "Owner card",
        itemAffiliateWebUrl: `https://www.ebay.com/itm/456?mkcid=1&campid=${CAMPID}`,
      })?.affiliateUrl;
    },
  },
];

for (const routeCase of routeCases) {
  test(`${routeCase.name}: classifier failure cannot block the EPN redirect`, () => {
    assertFallback();

    const source = fs.readFileSync(new URL(routeCase.path, import.meta.url), "utf8");
    assert.match(source, /classifyEbayAffiliateRequest\(request\)/);
    assert.doesNotMatch(source, /classifyAffiliateRequest\(request\)/);
    assert.match(source, routeCase.redirectPattern);

    const target = routeCase.buildTarget();
    assert.ok(target);
    assertEpnTarget(target);
  });
}

test("eBay fail-open wrapper uses the same failure values as the Amazon beacon", () => {
  assertFallback();
  const amazonQuality = fs.readFileSync(
    new URL("../app/api/events/amazon-affiliate-click/quality.mjs", import.meta.url),
    "utf8",
  );
  assert.match(amazonQuality, /clientClass: "unclassified", qualityReason: "classifier_error"/);
});
