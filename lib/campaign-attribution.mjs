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
