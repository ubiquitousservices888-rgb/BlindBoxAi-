const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const BLINDBOX_HOSTS = new Set(["blindboxai.com", "www.blindboxai.com"]);

export function normalizeCampaignId(value) {
  const raw = String(value || "").trim();
  if (!raw || !SAFE_ID.test(raw)) return "";
  return raw.toLowerCase();
}

export function normalizeSource(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "page";
  return raw.replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "page";
}

export function normalizeAttributionSource(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "none";
  const normalized = raw.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return normalized || "none";
}

export function resolveRequestAttribution({ campaign, source, referer } = {}) {
  const explicitCampaign = normalizeCampaignId(campaign);
  const explicitSource = normalizeAttributionSource(source);
  if (explicitCampaign || explicitSource !== "none") {
    return {
      campaignId: explicitCampaign,
      source: explicitSource,
      recoveredFrom: explicitCampaign ? "query_campaign" : "query_source",
    };
  }

  try {
    const ref = new URL(String(referer || ""));
    if (ref.protocol !== "https:" || !BLINDBOX_HOSTS.has(ref.hostname)) {
      return { campaignId: "", source: "none", recoveredFrom: "none" };
    }

    const refCampaign = normalizeCampaignId(ref.searchParams.get("campaign"));
    const refSource = normalizeAttributionSource(
      ref.searchParams.get("source") || ref.searchParams.get("utm_source"),
    );
    if (!refCampaign && refSource === "none") {
      return { campaignId: "", source: "none", recoveredFrom: "none" };
    }

    return {
      campaignId: refCampaign,
      source: refSource,
      recoveredFrom: "blindbox_referrer",
    };
  } catch {
    return { campaignId: "", source: "none", recoveredFrom: "none" };
  }
}

// Backward-compatible alias for existing callers while all outbound routes converge
// on the same attribution resolver.
export const resolveRequestCampaign = resolveRequestAttribution;

function slugPart(value, max = 32) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export function buildCampaignId({ platform, contentType, seriesSlug, date = new Date() }) {
  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) throw new Error("Campaign date is invalid");
  const platformPart = slugPart(platform, 16);
  const typePart = slugPart(contentType, 16);
  const seriesPart = slugPart(seriesSlug, 32);
  if (!platformPart || !typePart || !seriesPart) throw new Error("Campaign platform, content type, and series are required");
  const monthDay = `${String(when.getUTCMonth() + 1).padStart(2, "0")}${String(when.getUTCDate()).padStart(2, "0")}`;
  return normalizeCampaignId(`${platformPart}-${typePart}-${seriesPart}-${monthDay}`);
}

export function campaignCustomIdSuffix({ campaignId, source }) {
  const campaign = normalizeCampaignId(campaignId);
  const normalizedSource = normalizeAttributionSource(source);
  const sourcePart = normalizedSource.replace(/[^a-z0-9]/g, "");
  if (campaign) {
    return `ce${campaign.replace(/[^a-z0-9]/g, "")}x${sourcePart || "none"}`;
  }
  if (normalizedSource !== "none" && normalizedSource !== "page") {
    return `sx${sourcePart}`;
  }
  return "";
}

export function campaignQuery({ campaignId, source } = {}) {
  const campaign = normalizeCampaignId(campaignId);
  const normalizedSource = normalizeAttributionSource(source);
  if (!campaign && normalizedSource === "none") return "";
  const params = new URLSearchParams();
  if (campaign) params.set("campaign", campaign);
  if (normalizedSource !== "none") params.set("source", normalizedSource);
  return params.toString();
}
