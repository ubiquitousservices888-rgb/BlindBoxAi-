import assert from "node:assert/strict";
import test from "node:test";

import { readSellerCollection } from "../lib/owner-ebay-oauth.mjs";

test("seller collection sends eBay locale header", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { inventoryItems: [], total: 0 };
      },
    };
  };

  const result = await readSellerCollection(
    "https://api.ebay.com/sell/inventory/v1/inventory_item?limit=2&offset=0",
    "unit-test-access-token",
    "inventoryItems",
    fetchImpl,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(calls[0].init.headers["Accept-Language"], "en-US");
  assert.equal(calls[0].init.headers.Authorization, "Bearer unit-test-access-token");
  assert.equal(calls[0].init.cache, "no-store");
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    returned: 0,
    total: 0,
    error: null,
  });
});
