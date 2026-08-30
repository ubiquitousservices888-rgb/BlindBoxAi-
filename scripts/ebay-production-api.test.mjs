import assert from "node:assert/strict";
import test from "node:test";

import {
  ebayProductionApiConfigured,
  normalizeEbayAffiliateReference,
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
