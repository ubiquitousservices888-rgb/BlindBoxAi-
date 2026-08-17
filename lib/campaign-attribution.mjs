const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

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
  if (!campaign) return "";
  return `ce${campaign.replace(/[^a-z0-9]/g, "")}x${normalizeSource(source).replace(/[^a-z0-9]/g, "")}`;
}

export function campaignQuery({ campaignId, source } = {}) {
  const campaign = normalizeCampaignId(campaignId);
  if (!campaign) return "";
  const params = new URLSearchParams({ campaign, source: normalizeSource(source) });
  return params.toString();
}
