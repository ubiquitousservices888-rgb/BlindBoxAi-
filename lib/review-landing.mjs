import landingDocument from "../data/review-video-landings.json" with { type: "json" };
import { HAIR_SALON_MEDIA_URL, HAIR_SALON_TITLE } from "./hair-salon-asset.mjs";

// Owner rule (Nov 7, 2026): every published review video must land on a
// blindboxai.com page whose affiliate links match the video's topic and carry
// the video's campaign tag. The homepage does not qualify: its eBay links are
// Pop Mart only and do not carry the campaign through.

export const LANDING_BASE_URL = "https://www.blindboxai.com";
export const LANDING_BLOCKED_MESSAGE =
  "This video has no affiliate page yet, so it cannot publish. Choose a matching page for it first.";

// Guide pages proven to pass `campaign`/`source` into every affiliate link.
// A guide is added here only together with a test that proves it.
export const QUALIFYING_GUIDES = Object.freeze({
  "/guides/mew-ex-152-vs-158": Object.freeze({ topic: "pokemon", label: "Mew ex #152 vs #158 guide (Pokémon eBay links)" }),
});

// Series pages render LiveEbayListings with the page's campaign/source.
// Kept in step with data/series by scripts/review-landing.test.mjs.
export const QUALIFYING_SERIES = new Set([
  "hirono-city-of-mercy",
  "hirono-mist-walker",
  "hirono-shelter-series",
  "labubu-sanrio-collaboration",
  "labubu-the-monsters-big-into-energy",
  "labubu-the-monsters-exciting-macaron",
  "labubu-the-monsters-hair-salon",
  "labubu-the-monsters-have-a-seat",
  "skullpanda-limpressionnisme",
  "skullpanda-petals-in-four-acts",
  "skullpanda-the-mirage",
  "skullpanda-the-sound",
  "skullpanda-you-found-me",
  "smiski-series-1",
  "twinkle-twinkle-be-a-little-star-plush",
  "twinkle-twinkle-why-so-serious-plush",
  "unicorno-series-12",
  "we-are-twinkle-twinkle-plush",
]);

const LANDING_CHOICES = Object.freeze(
  landingDocument && typeof landingDocument.landings === "object" && landingDocument.landings ? landingDocument.landings : {},
);

export function qualifyingLanding(landingPath) {
  const value = String(landingPath ?? "");
  if (Object.hasOwn(QUALIFYING_GUIDES, value)) return { path: value, ...QUALIFYING_GUIDES[value] };
  const match = /^\/series\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value);
  if (match && QUALIFYING_SERIES.has(match[1])) {
    return { path: value, topic: "pop_mart", label: `Series guide ${match[1]} (live eBay links)` };
  }
  return null;
}

// Each video topic maps to the one kind of affiliate page that matches it.
// A topic with no mapping (sports cards, Magic, unknown) has no qualifying page.
const VERTICAL_TOPICS = Object.freeze({
  pokemon_tcg: "pokemon",
  pop_mart: "pop_mart",
});
// The staging step files most uploads as other_collectible (it guesses from
// the title). Only for those rows may the owner's landing choice state the
// video's real topic; a specific stored topic can never be overridden.
const GENERIC_VERTICALS = new Set(["", "other_collectible"]);

function videoTopic(itemVertical, choiceVertical) {
  const stored = String(itemVertical ?? "").trim();
  const chosen = String(choiceVertical ?? "").trim();
  if (!GENERIC_VERTICALS.has(stored)) {
    if (chosen && chosen !== stored) return "";
    return VERTICAL_TOPICS[stored] || "";
  }
  return VERTICAL_TOPICS[chosen] || "";
}

function blocked(reason) {
  return { url: LANDING_BASE_URL, path: "/", qualifies: false, label: "Homepage (no matching affiliate links)", reason };
}

// The landing page the video's tracked link points to, and whether it meets
// the owner's affiliate rule. Never throws.
export function reviewVideoLanding(item) {
  if (item?.title === HAIR_SALON_TITLE && item?.video_url === HAIR_SALON_MEDIA_URL) {
    const landing = qualifyingLanding("/series/labubu-the-monsters-hair-salon");
    if (landing) return { url: `${LANDING_BASE_URL}${landing.path}`, path: landing.path, qualifies: true, label: landing.label, reason: "" };
  }
  const runId = String(item?.research_run_id ?? "");
  const choice = /^rv-[a-f0-9]{16}$/.test(runId) && Object.hasOwn(LANDING_CHOICES, runId)
    ? LANDING_CHOICES[runId]
    : null;
  if (!choice) return blocked(LANDING_BLOCKED_MESSAGE);
  if (!item?.video_url || choice.video_url !== item.video_url) {
    return blocked("This video's file changed after its affiliate page was chosen, so it cannot publish until the page is chosen again.");
  }
  const landing = qualifyingLanding(choice.path);
  if (!landing) return blocked("The chosen page is not one that carries tagged affiliate links, so this video cannot publish.");
  if (videoTopic(item?.vertical, choice.vertical) !== landing.topic) {
    return blocked("The chosen page's affiliate links do not match this video's topic, so it cannot publish.");
  }
  return { url: `${LANDING_BASE_URL}${landing.path}`, path: landing.path, qualifies: true, label: landing.label, reason: "" };
}

// Exposed for tests only.
export const videoTopicForTest = videoTopic;
