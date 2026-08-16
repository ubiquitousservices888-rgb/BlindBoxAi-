import assert from "node:assert/strict";
import {
  evaluateVisualAsset,
  requireApprovedVisual,
  evaluateVisualManifest,
  requireApprovedVisualManifest,
} from "../lib/verified-visual-asset.mjs";

const approved = {
  url: "https://assets.blindboxai.com/product.jpg",
  sourceType: "owned-product-photo",
  sourcePage: "https://www.blindboxai.com/",
  reuseRights: "owned",
  productMatch: "exact",
  observedAt: "2026-08-16T18:00:00Z",
  aiUseAllowed: true,
};

assert.equal(evaluateVisualAsset(approved).status, "APPROVED_VISUAL");
assert.doesNotThrow(() => requireApprovedVisual(approved));
assert.equal(evaluateVisualManifest({ productId: "x", assets: [approved] }).status, "APPROVED_VISUAL_MANIFEST");
assert.doesNotThrow(() => requireApprovedVisualManifest({ productId: "x", assets: [approved] }));

for (const bad of [
  { ...approved, sourceType: "google-images" },
  { ...approved, sourceType: "marketplace-seller-photo", reuseRights: "unknown" },
  { ...approved, productMatch: "similar" },
  { ...approved, reuseRights: "official" },
  { ...approved, sourcePage: "" },
  { ...approved, url: "http://example.com/product.jpg" },
  { ...approved, reuseRights: "epn-promotional-content", aiUseAllowed: true },
]) {
  assert.equal(evaluateVisualAsset(bad).status, "HOLD_FOR_VISUAL");
  assert.throws(() => requireApprovedVisual(bad));
}

assert.equal(evaluateVisualManifest({ productId: "x", assets: [] }).status, "HOLD_FOR_VISUAL");
assert.throws(() => requireApprovedVisualManifest({ productId: "x", assets: [] }));

console.log("verified visual asset tests passed");
