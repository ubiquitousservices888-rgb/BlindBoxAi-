import { normalizeCampaignId, normalizeSource } from "./campaign-attribution.mjs";

export const AMAZON_ASSOCIATE_TAG = "blindboxai-20";

const ACCESSORY_OFFERS = Object.freeze([
  {
    id: "acrylic-display-case",
    title: "Dust-resistant acrylic display cases",
    useCase: "Keep small figures visible while reducing dust and handling.",
    searchQuery: "acrylic display case collectibles dustproof",
    priority: 100,
  },
  {
    id: "acrylic-display-risers",
    title: "Acrylic display risers",
    useCase: "Add height so figures in the back row are not buried behind the front row.",
    searchQuery: "acrylic display risers collectibles",
    priority: 95,
  },
  {
    id: "mini-display-lighting",
    title: "Rechargeable display lighting",
    useCase: "Add simple lighting to shelves and display cases without permanent wiring.",
    searchQuery: "rechargeable LED puck lights display case",
    priority: 90,
  },
  {
    id: "figure-storage-organizer",
    title: "Figure storage organizers",
    useCase: "Separate loose figures and accessories when they are not on display.",
    searchQuery: "collectible figure storage organizer",
    priority: 85,
  },
  {
    id: "display-turntable",
    title: "Motorized display turntables",
    useCase: "Rotate figures for inspection, photography, and short-form video.",
    searchQuery: "motorized display turntable collectibles",
    priority: 80,
  },
]);

export function allAmazonAccessoryOffers() {
  return [...ACCESSORY_OFFERS].sort((a, b) => b.priority - a.priority);
}

export function getAmazonAccessoryOffer(id) {
  const normalized = String(id ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return ACCESSORY_OFFERS.find((offer) => offer.id === normalized) || null;
}

export function buildAmazonSearchUrl(offerId) {
  const offer = getAmazonAccessoryOffer(offerId);
  if (!offer) throw new Error("Amazon accessory offer not found");

  const target = new URL("https://www.amazon.com/s");
  target.searchParams.set("k", offer.searchQuery);
  target.searchParams.set("tag", AMAZON_ASSOCIATE_TAG);
  return target.toString();
}

export function amazonOutboundPath(offerId, attribution = {}) {
  const offer = getAmazonAccessoryOffer(offerId);
  if (!offer) throw new Error("Amazon accessory offer not found");

  const params = new URLSearchParams({ offer: offer.id });
  const campaignId = normalizeCampaignId(attribution.campaignId);
  if (campaignId) params.set("campaign", campaignId);
  params.set("source", normalizeSource(attribution.source || "amazon_accessories"));
  return `/api/out/amazon?${params.toString()}`;
}
