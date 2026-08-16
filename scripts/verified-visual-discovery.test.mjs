import assert from "node:assert/strict";
import { discoverProductVisual } from "./verified-visual-discovery.mjs";

const product = {
  id: "test-product",
  name: "Test Product",
  sources: [
    { status: "verified", url: "https://www.popmart.com/us/products/1/test-product" },
  ],
};

const okFetch = async () => ({
  ok: true,
  status: 200,
  text: async () => '<html><head><meta property="og:image" content="https://cdn-global.popmart.com/test.jpg"></head></html>',
});

const candidates = await discoverProductVisual(product, okFetch);
assert.equal(candidates.length, 1);
assert.equal(candidates[0].state, "REFERENCE_ONLY");
assert.equal(candidates[0].url, "https://cdn-global.popmart.com/test.jpg");
assert.equal(candidates[0].reuseRights, "unverified");
assert.equal(candidates[0].aiUseAllowed, false);

const blocked = await discoverProductVisual({
  ...product,
  sources: [{ status: "verified", url: "https://example.com/product" }],
}, okFetch);
assert.deepEqual(blocked, []);

const noImage = await discoverProductVisual(product, async () => ({
  ok: true,
  status: 200,
  text: async () => "<html></html>",
}));
assert.equal(noImage[0].state, "DISCOVERY_FAILED");
assert.equal(noImage[0].reason, "missing-meta-image");

console.log("verified visual discovery tests passed");
