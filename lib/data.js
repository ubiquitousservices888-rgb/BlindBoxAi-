import fs from "fs";
import path from "path";

import { buildEbaySearchUrl } from "./affiliate-policy.mjs";
import { campaignCustomIdSuffix, normalizeCampaignId, normalizeSource } from "./campaign-attribution.mjs";
import { isValidSource } from "./attribution.mjs";
import { evaluateAffiliateEligibility } from "./market-eligibility.mjs";

const DIR = path.join(process.cwd(), "data", "series");

export function allSeries() {
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSeries(slug) {
  return allSeries().find(s => s.slug === slug) || null;
}

// Verified = every priced figure confirmed (needsReview false)
export function seriesVerified(s) {
  const figures = Array.isArray(s?.figures) ? s.figures : [];
  const eligibility = evaluateAffiliateEligibility(s);
  return figures.length > 0 && eligibility.verifiedMarketRecordCount === figures.length;
}

export function priceSpan(s) {
  const records = evaluateAffiliateEligibility(s).verifiedMarketRecords;
  const lows = records.map(record => record.resaleLowUSD);
  const highs = records.map(record => record.resaleHighUSD);
  if (!lows.length) return null;
  return { low: Math.min(...lows), high: Math.max(...highs) };
}

export function seriesPriceVerification(s) {
  const figures = Array.isArray(s?.figures) ? s.figures : [];
  const verified = evaluateAffiliateEligibility(s).verifiedMarketRecords;
  return {
    verifiedCount: verified.length,
    needsResearchCount: Math.max(0, figures.length - verified.length),
  };
}

function customIdPart(value, maxLength) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, maxLength);
}

export function epnCustomId({
  seriesSlug,
  figure,
  kind,
  placement,
  campaignId = "",
  source = "page",
}) {
  const campaignSuffix = campaignCustomIdSuffix({ campaignId, source });
  const value =
    "bb1" +
    "s" + customIdPart(seriesSlug, 50) +
    "f" + customIdPart(figure, 100) +
    "k" + customIdPart(kind, 20) +
    "p" + customIdPart(placement, 40) +
    campaignSuffix;
  return value.slice(0, 240);
}

export function ebaySoldLink(query, customId = "") {
  return buildEbaySearchUrl({ query, kind: "sold", customId, campid: process.env.NEXT_PUBLIC_EPN_CAMPID });
}

export function ebayActiveLink(query, customId = "") {
  return buildEbaySearchUrl({ query, kind: "active", customId, campid: process.env.NEXT_PUBLIC_EPN_CAMPID });
}

export function ebayOutboundPath(seriesSlug, figure, kind, attribution = {}) {
  const params = new URLSearchParams({
    series: seriesSlug,
    figure,
    kind,
    placement: "series_table",
    itemSlug: figure,
  });

  const campaignId = normalizeCampaignId(attribution.campaignId);
  const source = isValidSource(attribution.source) ? attribution.source : "";
  const vertical = ["bb", "sc", "tc"].includes(attribution.vertical) ? attribution.vertical : "";

  if (campaignId) {
    params.set("campaign", campaignId);
    if (attribution.source) params.set("source", normalizeSource(attribution.source));
  } else if (source) {
    params.set("source", source);
  }
  if (vertical) params.set("vertical", vertical);

  return `/api/out/ebay?${params.toString()}`;
}

/*
 * Backward compatibility for older components.
 * Existing behavior remains the sold-comparison destination.
 */
export function ebayLink(query) {
  return ebaySoldLink(query);
}
