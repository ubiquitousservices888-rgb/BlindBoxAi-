import { isTaggedAttribution, normalizeAttributionSource, normalizeCampaignId } from "./campaign-attribution.mjs";

// BlindBoxAI's own paid product. The checkout target is a fixed constant so
// /api/out/guide can never be used as an open redirect.
export const FAKE_CHECK_GUIDE = Object.freeze({
  id: "fake-check-field-guide",
  name: "The Fake-Check Field Guide: Pop Mart Blind Boxes + Pokémon Cards",
  shortName: "The Fake-Check Field Guide",
  promoSummary: "Collector checks for Pop Mart blind boxes, Labubu and Pokémon cards, with original illustrations.",
  priceUsd: 7,
  format: "PDF, 13 pages, US Letter",
  checkoutUrl: "https://ubiquity6.gumroad.com/l/bjfpgf",
  path: "/guides/fake-check-field-guide",
  summary: "Fast, sourced checks for Pop Mart blind boxes, Labubu and Pokémon cards, before you buy and the day it arrives.",
  intro: [
    "Counterfeit blind boxes and cards are everywhere, and fakers now copy boxes, tags and even QR codes.",
    "No single trick catches them. This guide gives you a stack of quick checks that do.",
  ],
  inside: Object.freeze([
    "The 60-second check to run on every listing",
    "How to read sold prices so a \"deal\" doesn't fool you (no lots, 2+ sales, dated)",
    "Pop Mart box, code, figure and Labubu checks (9 teeth, ears, foot stamps, UV stamp, resealed boxes)",
    "Pokémon card checks: collector number first, print and text, back, holo, weight",
    "11 side-by-side real vs fake illustrations (original drawings)",
    "What to do if it's fake: buyer protection windows and eBay's Authenticity Guarantee",
    "A printable one-page checklist",
  ]),
  sourcesLine: "Every check is sourced (Pop Mart statements via Good Morning America, GamesRadar+, eBay Help and more), with the sources listed at the back.",
  disclaimer: "Educational only. Not an authentication certificate. BlindBoxAI is independent and not affiliated with Pop Mart, The Pokémon Company, Nintendo or eBay.",
});

// Where a buy link sits. Anything else is recorded as "unknown".
// A frozen array, because Object.freeze does not stop Set.add().
export const FAKE_CHECK_GUIDE_PLACEMENTS = Object.freeze([
  "guide_page",
  "mew_guide",
  "series_fake_check",
]);

export function normalizeGuidePlacement(value) {
  const raw = String(value || "").trim().toLowerCase();
  return FAKE_CHECK_GUIDE_PLACEMENTS.includes(raw) ? raw : "unknown";
}

// A visitor who arrived from a tagged video link keeps that campaign and source
// on the buy link; everyone else is credited to the page they clicked from.
export function fakeCheckGuideOutboundPath(attribution = {}, placement = "guide_page") {
  const campaignId = normalizeCampaignId(attribution?.campaignId);
  const source = normalizeAttributionSource(attribution?.source);
  const tagged = isTaggedAttribution({ source });
  const params = new URLSearchParams({
    placement: normalizeGuidePlacement(placement),
    ...(tagged && campaignId ? { campaign: campaignId } : {}),
    ...(tagged ? { source } : {}),
  });
  return `/api/out/guide?${params.toString()}`;
}

// Link from a series or guide page to the sales page. It names the page the
// visitor came from and carries a tagged visit along.
export function fakeCheckGuidePagePath(attribution = {}, from = "") {
  const campaignId = normalizeCampaignId(attribution?.campaignId);
  const source = normalizeAttributionSource(attribution?.source);
  const tagged = isTaggedAttribution({ source });
  const origin = normalizeGuidePlacement(from);
  const params = new URLSearchParams({
    ...(origin !== "unknown" && origin !== "guide_page" ? { from: origin } : {}),
    ...(tagged && campaignId ? { campaign: campaignId } : {}),
    ...(tagged ? { source } : {}),
  });
  const queryString = params.toString();
  return queryString ? `${FAKE_CHECK_GUIDE.path}?${queryString}` : FAKE_CHECK_GUIDE.path;
}
