import { normalizeCampaignId, normalizeSource } from "./campaign-attribution.mjs";

const BLINDBOX_HOSTS = new Set(["blindboxai.com", "www.blindboxai.com"]);

function cleanRunId(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 60);
}

export function buildTrackedSocialCta(baseUrl, { runId, service } = {}) {
  const url = new URL(String(baseUrl ?? ""));
  if (url.protocol !== "https:" || !BLINDBOX_HOSTS.has(url.hostname)) {
    throw new Error("Social attribution CTA must remain on BlindBoxAI HTTPS");
  }

  const cleanId = cleanRunId(runId);
  if (!cleanId) throw new Error("Social attribution runId is required");

  const campaignId = normalizeCampaignId(`bb-${cleanId}`);
  if (!campaignId) throw new Error("Social attribution campaign ID is invalid");

  const source = normalizeSource(service);
  if (!service || source === "page") {
    throw new Error("Social attribution service is required");
  }

  url.searchParams.set("campaign", campaignId);
  url.searchParams.set("source", source);
  return url.toString();
}

export function applySocialAttribution(candidate) {
  if (!candidate?.ctaUrl || !candidate?.runId || !candidate?.captions) {
    throw new Error("Candidate CTA, runId, and captions are required for social attribution");
  }

  const next = structuredClone(candidate);
  for (const [service, caption] of Object.entries(next.captions)) {
    const text = String(caption ?? "");
    if (!text.includes(next.ctaUrl)) {
      throw new Error(`${service}: base BlindBoxAI CTA is missing before attribution`);
    }
    const trackedCta = buildTrackedSocialCta(next.ctaUrl, {
      runId: next.runId,
      service,
    });
    next.captions[service] = text.replace(next.ctaUrl, trackedCta);
  }

  return next;
}
