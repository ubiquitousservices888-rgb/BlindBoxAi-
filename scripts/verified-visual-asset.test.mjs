import assert from "node:assert/strict";
import { evaluateVisualAsset, requireApprovedVisual } from "../lib/verified-visual-asset.mjs";

const approved = {
  url: "https://global-static.popmart.com/example/product.jpg",
  sourceType: "official-product-image",
  sourcePage: "https://www.popmart.com/",
  reuseRights: "official",
  productMatch: "exact",
  observedAt: "2026-08-16T18:00:00Z",
};

assert.equal(evaluateVisualAsset(approved).status, "APPROVED_VISUAL");
assert.doesNotThrow(() => requireApprovedVisual(approved));

for (const bad of [
  { ...approved, sourceType: "google-images" },
  { ...approved, sourceType: "marketplace-seller-photo", reuseRights: "unknown" },
  { ...approved, productMatch: "similar" },
  { ...approved, reuseRights: "unknown" },
  { ...approved, url: "https://example.com/product.jpg" },
]) {
  assert.equal(evaluateVisualAsset(bad).status, "HOLD_FOR_VISUAL");
  assert.throws(() => requireApprovedVisual(bad));
}

console.log("verified visual asset tests passed");
