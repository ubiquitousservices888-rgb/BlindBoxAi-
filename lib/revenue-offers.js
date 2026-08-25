import { allSeries, epnCustomId } from "./data";
import { normalizeCampaignId, normalizeSource } from "./campaign-attribution.mjs";
import {
  sortRevenueOffers,
  TWINKLE_STRONG_BREAD_OFFER,
  verifiedFigureOffer,
} from "./buy-or-pass-core.mjs";

export function allRevenueOffers() {
  const offers = [TWINKLE_STRONG_BREAD_OFFER];

  for (const series of allSeries()) {
    for (const figure of Array.isArray(series.figures) ? series.figures : []) {
      const offer = verifiedFigureOffer(series, figure);
      if (offer) offers.push(offer);
    }
  }

  const deduped = new Map();
  for (const offer of offers) {
    if (!deduped.has(offer.id)) deduped.set(offer.id, offer);
  }

  return sortRevenueOffers([...deduped.values()]);
}

export function getRevenueOffer(id) {
  const normalized = String(id ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return allRevenueOffers().find((offer) => offer.id === normalized) || null;
}

export function revenueOfferCustomId(offer, kind, attribution = {}) {
  if (!offer) throw new Error("Revenue offer is required");
  return epnCustomId({
    seriesSlug: offer.seriesSlug || offer.id,
    figure: offer.figure,
    kind,
    placement: "buy_or_pass",
    campaignId: normalizeCampaignId(attribution.campaignId),
    source: normalizeSource(attribution.source || "buy_or_pass"),
  });
}

export function revenueOutboundPath(offerId, kind, attribution = {}) {
  if (kind !== "active" && kind !== "sold") throw new Error("Revenue outbound kind must be active or sold");
  const offer = getRevenueOffer(offerId);
  if (!offer) throw new Error("Revenue offer not found");

  const params = new URLSearchParams({
    offer: offer.id,
    kind,
  });
  const campaignId = normalizeCampaignId(attribution.campaignId);
  if (campaignId) params.set("campaign", campaignId);
  params.set("source", normalizeSource(attribution.source || "buy_or_pass"));
  return `/api/out/offer?${params.toString()}`;
}
