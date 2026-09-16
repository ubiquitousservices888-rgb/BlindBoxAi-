import assert from "node:assert/strict";
import test from "node:test";

import { buildAskVisualClickPath, normalizeAskVisualQuery } from "../lib/ask-visual-search.mjs";
import {
  ebayProductionApiConfigured,
  normalizeEbayAffiliateReference,
  normalizeEbayBrowseItem,
  normalizeEbayBrowseItems,
} from "../lib/ebay-production-api.mjs";

test("eBay Production API requires both OAuth credentials", () => {
  assert.equal(ebayProductionApiConfigured({}), false);
  assert.equal(ebayProductionApiConfigured({ EBAY_CLIENT_ID: "id" }), false);
  assert.equal(
    ebayProductionApiConfigured({ EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "secret" }),
    true,
  );
});

test("affiliate reference is bounded and safe", () => {
  const value = normalizeEbayAffiliateReference("bb live / twinkle ? social");
  assert.equal(value, "bb-live-twinkle-social");
  assert.ok(value.length <= 256);
});

test("Browse items expose only HTTPS eBay affiliate destinations", () => {
  const items = normalizeEbayBrowseItems({
    itemSummaries: [
      {
        itemId: "v1|123|0",
        title: "Twinkle Twinkle",
        price: { value: "29.99", currency: "USD" },
        itemAffiliateWebUrl: "https://www.ebay.com/itm/123?campid=1234567890",
      },
      {
        itemId: "v1|bad|0",
        title: "Bad destination",
        itemAffiliateWebUrl: "https://example.com/itm/bad",
      },
      {
        itemId: "v1|raw|0",
        title: "No affiliate URL",
        itemWebUrl: "https://www.ebay.com/itm/456",
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].itemId, "v1|123|0");
  assert.match(items[0].affiliateUrl, /^https:\/\/www\.ebay\.com\//);
});

test("single Browse item normalization rejects non-eBay destinations", () => {
  assert.equal(
    normalizeEbayBrowseItem({
      itemId: "v1|bad|0",
      title: "Bad destination",
      itemAffiliateWebUrl: "https://example.com/itm/bad",
    }),
    null,
  );

  const item = normalizeEbayBrowseItem({
    itemId: "v1|789|0",
    title: "Strong Bread",
    price: { value: "46.00", currency: "USD" },
    itemAffiliateWebUrl: "https://www.ebay.com/itm/789?campid=1234567890",
  });
  assert.equal(item.itemId, "v1|789|0");
  assert.match(item.affiliateUrl, /^https:\/\/www\.ebay\.com\//);
});

test("Ask visual search converts broad ranking questions into useful collectible queries", () => {
  assert.equal(normalizeAskVisualQuery("top 5 most valuable pokemon cards"), "pokemon cards");
  assert.equal(normalizeAskVisualQuery("What are the top 10 most valuable Magic cards?"), "Magic cards");
  assert.equal(normalizeAskVisualQuery("show me Labubu Macaron"), "Labubu Macaron");
});

test("Ask visual click paths keep the user's search text out of affiliate URLs", () => {
  const clickPath = buildAskVisualClickPath("v1|123|0", "campaign-1", "ask");
  const url = new URL(clickPath, "https://blindboxai.com");
  assert.equal(url.pathname, "/api/out/ebay-live");
  assert.equal(url.searchParams.get("item"), "v1|123|0");
  assert.equal(url.searchParams.get("context"), "ask");
  assert.equal(url.searchParams.get("id"), "visual-search");
  assert.equal(url.searchParams.get("campaign"), "campaign-1");
  assert.equal(url.searchParams.has("q"), false);
});
