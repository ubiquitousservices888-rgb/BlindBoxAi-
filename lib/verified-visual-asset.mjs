const BLOCKED_SOURCE_TYPES = new Set([
  "google-images",
  "social-repost",
  "marketplace-seller-photo",
  "unknown",
]);

const RENDER_APPROVED_RIGHTS = new Set([
  "owned",
  "licensed",
  "permission-granted",
  "epn-promotional-content",
]);

export function evaluateVisualAsset(asset = {}) {
  const reasons = [];
  const sourceType = String(asset.sourceType || "unknown").trim().toLowerCase();
  const productMatch = String(asset.productMatch || "").trim().toLowerCase();
  const rights = String(asset.reuseRights || "").trim().toLowerCase();
  const url = String(asset.url || "").trim();
  const sourcePage = String(asset.sourcePage || "").trim();
  const aiUseAllowed = asset.aiUseAllowed === true;

  if (!url) reasons.push("missing-url");
  if (!sourcePage) reasons.push("missing-source-page");
  if (BLOCKED_SOURCE_TYPES.has(sourceType)) reasons.push("unapproved-source-type");
  if (productMatch !== "exact") reasons.push("product-match-not-exact");
  if (!RENDER_APPROVED_RIGHTS.has(rights)) reasons.push("reuse-rights-not-established");

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") reasons.push("non-https-url");
    } catch {
      reasons.push("invalid-url");
    }
  }

  if (rights === "epn-promotional-content" && aiUseAllowed) {
    reasons.push("epn-content-cannot-enter-generative-ai-path");
  }

  return {
    status: reasons.length === 0 ? "APPROVED_VISUAL" : "HOLD_FOR_VISUAL",
    reasons,
    provenance: {
      sourceType,
      sourcePage,
      reuseRights: rights,
      productMatch,
      observedAt: String(asset.observedAt || "").trim(),
      aiUseAllowed,
    },
  };
}

export function requireApprovedVisual(asset) {
  const result = evaluateVisualAsset(asset);
  if (result.status !== "APPROVED_VISUAL") {
    throw new Error(`Visual asset rejected: ${result.reasons.join(", ")}`);
  }
  return result;
}

export function evaluateVisualManifest(manifest = {}) {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const reasons = [];
  if (String(manifest.productId || "").trim() === "") reasons.push("missing-product-id");
  if (assets.length === 0) reasons.push("missing-assets");

  const evaluated = assets.map((asset) => ({ asset, result: evaluateVisualAsset(asset) }));
  const renderable = evaluated.filter(({ result }) => result.status === "APPROVED_VISUAL");
  if (renderable.length === 0) reasons.push("no-render-approved-assets");

  return {
    status: reasons.length === 0 ? "APPROVED_VISUAL_MANIFEST" : "HOLD_FOR_VISUAL",
    reasons,
    assets: evaluated,
    renderableAssets: renderable.map(({ asset, result }) => ({ ...asset, provenance: result.provenance })),
  };
}

export function requireApprovedVisualManifest(manifest) {
  const result = evaluateVisualManifest(manifest);
  if (result.status !== "APPROVED_VISUAL_MANIFEST") {
    throw new Error(`Visual manifest rejected: ${result.reasons.join(", ")}`);
  }
  return result;
}
