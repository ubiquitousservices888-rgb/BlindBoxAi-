import { normalizeCampaignId, normalizeSource } from "./campaign-attribution.mjs";

// UTM strings are untrusted marketing labels, not transaction identifiers.
// Canonicalize unusual campaign labels only for first-party analytics.
// Never append these fields to the actual Amazon Special Link.
function utmCampaignId(value) {
  if (typeof value !== "string") return "";
  const valid = normalizeCampaignId(value);
  if (valid) return valid;
  const slug = value.trim().toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return normalizeCampaignId(slug);
}

function utmSource(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const slug = value.trim().toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug ? normalizeSource(slug) : "";
}

export function resolveAmazonAccessoryAttribution(query = {}) {
  return {
    campaignId: normalizeCampaignId(query?.campaign) || utmCampaignId(query?.utm_campaign),
    source: query?.source ? normalizeSource(query.source) : (utmSource(query?.utm_source) || "amazon_accessories"),
  };
}
