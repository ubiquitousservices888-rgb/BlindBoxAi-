import listingDocument from "../data/know-it-all/owner-ebay-listings.json" with { type: "json" };
import targetDocument from "../data/know-it-all/sports-card-research-targets.json" with { type: "json" };

import {
  normalizeAttributionSource,
  normalizeCampaignId,
} from "./campaign-attribution.mjs";

const targets = new Map(
  (targetDocument.targets || []).map(target => [String(target.id || "").trim(), target]),
);

const listings = new Map();
for (const entry of listingDocument.listings || []) {
  const researchTargetId = String(entry?.researchTargetId || "").trim();
  const legacyItemId = String(entry?.legacyItemId || "").trim();
  if (!researchTargetId || !/^\d{9,12}$/.test(legacyItemId)) continue;
  if (!targets.has(researchTargetId)) continue;
  if (listings.has(researchTargetId)) throw new Error(`Duplicate owner eBay listing target: ${researchTargetId}`);
  listings.set(researchTargetId, Object.freeze({
    researchTargetId,
    legacyItemId,
    status: String(entry?.status || "").trim(),
  }));
}

export function isEpnGenAiPromotionApproved(env = process.env) {
  return String(env?.EPN_GENAI_PROMOTIONAL_METHOD_APPROVED || "")
    .trim()
    .toLowerCase() === "true";
}

export function ownerCardBrowseItemId(legacyItemId) {
  const normalized = String(legacyItemId || "").trim();
  if (!/^\d{9,12}$/.test(normalized)) throw new Error("A verified legacy eBay item ID is required");
  return `v1|${normalized}|0`;
}

export function getOwnerCardListing(researchTargetId) {
  const id = String(researchTargetId || "").trim();
  const listing = listings.get(id);
  const target = targets.get(id);
  if (!listing || !target) return null;
  return {
    ...listing,
    browseItemId: ownerCardBrowseItemId(listing.legacyItemId),
    identity: target.identity || null,
    query: String(target.query || "").trim(),
    claims: Array.isArray(target.claims) ? [...target.claims] : [],
  };
}

export function allOwnerCardListings() {
  return [...listings.keys()].map(getOwnerCardListing).filter(Boolean);
}

export function ownerCardLandingPath(researchTargetId, attribution = {}) {
  const listing = getOwnerCardListing(researchTargetId);
  if (!listing) throw new Error("Unknown owner card listing");
  const params = new URLSearchParams();
  const campaign = normalizeCampaignId(attribution.campaignId || attribution.campaign || "");
  const source = normalizeAttributionSource(attribution.source || "");
  if (campaign) params.set("campaign", campaign);
  if (source !== "none") params.set("source", source);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/cards/${encodeURIComponent(listing.researchTargetId)}${suffix}`;
}
