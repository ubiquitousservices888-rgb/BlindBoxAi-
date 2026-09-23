import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CAMPID = "5339171775";

function assertTrackedEbayRedirect(response) {
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location);
  const url = new URL(location);
  assert.equal(url.protocol, "https:");
  assert.match(url.hostname, /(^|\.)ebay\.com$/i);
  assert.equal(url.searchParams.get("campid"), CAMPID);
}

test("all eBay outbound routes still redirect when the shared classifier throws", async (t) => {
  const prior = {
    nextPublic: process.env.NEXT_PUBLIC_EPN_CAMPID,
    epnCampaign: process.env.EBAY_EPN_CAMPAIGN_ID,
    genaiApproval: process.env.EPN_GENAI_PROMOTIONAL_METHOD_APPROVED,
  };
  process.env.NEXT_PUBLIC_EPN_CAMPID = CAMPID;
  process.env.EBAY_EPN_CAMPAIGN_ID = CAMPID;
  process.env.EPN_GENAI_PROMOTIONAL_METHOD_APPROVED = "true";

  t.after(() => {
    if (prior.nextPublic === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
    else process.env.NEXT_PUBLIC_EPN_CAMPID = prior.nextPublic;
    if (prior.epnCampaign === undefined) delete process.env.EBAY_EPN_CAMPAIGN_ID;
    else process.env.EBAY_EPN_CAMPAIGN_ID = prior.epnCampaign;
    if (prior.genaiApproval === undefined) delete process.env.EPN_GENAI_PROMOTIONAL_METHOD_APPROVED;
    else process.env.EPN_GENAI_PROMOTIONAL_METHOD_APPROVED = prior.genaiApproval;
  });

  const nextServerStub = new URL("./fixtures/next-server-test-stub.mjs", import.meta.url);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/server") {
        return { url: nextServerStub.href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => hooks.deregister());

  t.mock.module(new URL("../lib/click-quality.mjs", import.meta.url), {
    exports: {
      classifyAffiliateRequest() {
        throw new Error("forced classifier failure");
      },
    },
  });

  t.mock.module(new URL("../lib/ebay-production-api.mjs", import.meta.url), {
    exports: {
      normalizeEbayAffiliateReference(value) {
        return String(value || "")
          .trim()
          .replace(/[^A-Za-z0-9._-]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 256);
      },
      async getEbayProductionItem({ itemId, affiliateReferenceId }) {
        const target = new URL("https://www.ebay.com/itm/800688881524");
        target.searchParams.set("mkcid", "1");
        target.searchParams.set("campid", CAMPID);
        target.searchParams.set("customid", String(affiliateReferenceId || ""));
        return {
          itemId: String(itemId || "v1|800688881524|0"),
          title: "Verified test listing",
          affiliateUrl: target.toString(),
        };
      },
    },
  });

  const [{ GET: seriesGet }, { GET: liveGet }, { GET: offerGet }, { GET: ownerCardGet }] =
    await Promise.all([
      import("../app/api/out/ebay/route.js?fail-open-route-test"),
      import("../app/api/out/ebay-live/route.js?fail-open-route-test"),
      import("../app/api/out/offer/route.js?fail-open-route-test"),
      import("../app/api/out/owner-card/route.js?fail-open-route-test"),
    ]);

  const cases = [
    {
      name: "series route",
      handler: seriesGet,
      request: new Request(
        "https://blindboxai.com/api/out/ebay?series=labubu-the-monsters-hair-salon&figure=Blow%20Dry&kind=active&placement=series_table&itemSlug=Blow%20Dry",
        { headers: { "user-agent": "Mozilla/5.0" } },
      ),
    },
    {
      name: "buy-or-pass offer route",
      handler: offerGet,
      request: new Request(
        "https://blindboxai.com/api/out/offer?offer=twinkle-twinkle-savor-the-moment--strong-bread&kind=active",
        { headers: { "user-agent": "Mozilla/5.0" } },
      ),
    },
    {
      name: "live item route",
      handler: liveGet,
      request: new Request(
        "https://blindboxai.com/api/out/ebay-live?item=v1%7C800688881524%7C0&context=offer&id=twinkle-twinkle-savor-the-moment--strong-bread",
        { headers: { "user-agent": "Mozilla/5.0" } },
      ),
    },
    {
      name: "owner-card route",
      handler: ownerCardGet,
      request: new Request(
        "https://blindboxai.com/api/out/owner-card?id=2021-bowman-platinum-nick-gonzales-pe-23-auto",
        { headers: { "user-agent": "Mozilla/5.0" } },
      ),
    },
  ];

  for (const routeCase of cases) {
    const response = await routeCase.handler(routeCase.request);
    assertTrackedEbayRedirect(response);
  }
});
