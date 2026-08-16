const ALLOWED_PUBLIC_IMAGE_HOSTS = new Set([
  "prod-out-res.popmart.com",
  "global-static.popmart.com",
]);

const BLOCKED_SOURCE_TYPES = new Set([
  "google-images",
  "social-repost",
  "marketplace-seller-photo",
  "unknown",
]);

export function evaluateVisualAsset(asset = {}) {
  const reasons = [];
  const sourceType = String(asset.sourceType || "unknown").trim().toLowerCase();
  const productMatch = String(asset.productMatch || "").trim().toLowerCase();
  const rights = String(asset.reuseRights || "").trim().toLowerCase();
  const url = String(asset.url || "").trim();

  if (!url) reasons.push("missing-url");
  if (BLOCKED_SOURCE_TYPES.has(sourceType)) reasons.push("unapproved-source-type");
  if (productMatch !== "exact") reasons.push("product-match-not-exact");
  if (!["official", "licensed", "owned", "permission-granted"].includes(rights)) {
    reasons.push("reuse-rights-not-established");
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") reasons.push("non-https-url");
      if (rights === "official" && !ALLOWED_PUBLIC_IMAGE_HOSTS.has(parsed.hostname)) {
        reasons.push("official-host-not-allowlisted");
      }
    } catch {
      reasons.push("invalid-url");
    }
  }

  return {
    status: reasons.length === 0 ? "APPROVED_VISUAL" : "HOLD_FOR_VISUAL",
    reasons,
    provenance: {
      sourceType,
      sourcePage: String(asset.sourcePage || "").trim(),
      reuseRights: rights,
      productMatch,
      observedAt: String(asset.observedAt || "").trim(),
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
