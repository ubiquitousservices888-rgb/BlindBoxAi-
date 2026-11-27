// Pure policy for owner-authorized direct-product promotions. Not a publisher.
// A trusted queue row or exact server-side selection binds the reviewed media.
import { createHash } from "node:crypto";
import { assertApprovedReviewVideoUrl } from "./review-publish-safety.mjs";
const PRODUCTS = Object.freeze({
  fake_check: Object.freeze({ title: "The Fake-Check Field Guide", url: "https://ubiquity6.gumroad.com/l/bjfpgf" }),
  sports_card_bundle: Object.freeze({ title: "Sports Card Collecting Series", url: "https://ubiquity6.gumroad.com/l/fxloos" }),
});
const RUN = /^rv-[a-f0-9]{16}$/;
const CHANNELS = new Set(["youtube", "tiktok"]);

export function buildOwnProductPromotion(item, selection, channel) {
  if (!CHANNELS.has(channel)) throw new Error("Unsupported direct-product channel");
  if (!selection || selection.mode !== "own_product" || typeof selection.product !== "string" || !Object.hasOwn(PRODUCTS, selection.product)) {
    throw new Error("Explicit owner product selection required");
  }
  if (typeof item?.research_run_id !== "string" || !RUN.test(item.research_run_id) ||
      item.research_run_id !== selection.research_run_id || typeof item.video_url !== "string" ||
      item.video_url !== selection.video_url || typeof item.title !== "string" || !item.title.trim() ||
      item.title !== selection.reviewed_title ||
      !["ready_for_review", "approved", "publishing"].includes(item.status)) {
    throw new Error("Exact reviewed media identity required");
  }
  const media = new URL(assertApprovedReviewVideoUrl(item.video_url));
  // Keep direct-product binding strict while sharing the canonical host contract.
  const filename = media.pathname.split("/media/review/")[1];
  if (media.username || media.password || media.port || media.search || media.hash ||
      !/^[a-zA-Z0-9_-]+\.mp4$/.test(filename ?? "") ||
      media.pathname.split("/media/review/").length !== 2) {
    throw new Error("Approved review media required");
  }
  const product = PRODUCTS[selection.product];
  const title = selection.public_title ?? product.title;
  if (!Object.values(PRODUCTS).some(entry => entry.title === title)) throw new Error("Invalid direct-product video title");
  const campaignId = `bb-${item.research_run_id}`;
  const link = new URL(product.url);
  link.searchParams.set("utm_source", channel);
  link.searchParams.set("utm_campaign", campaignId);
  const trackedUrl = link.toString();
  const caption = `${title}\nOur digital collecting resource: ${product.title}. Get it on Gumroad:\n${trackedUrl}`;
  return { mode: "own_product", channel, title, caption, url: product.url, trackedUrl,
    campaignId, source: channel, revenueSource: "gumroad" };
}

// Preserve the previously owner-selected bundle destination for this exact
// Fake-Check campaign. Other uploads use only unambiguous catalog aliases.
const OWNER_PRODUCT_SELECTIONS = Object.freeze({
  "rv-f98394fe47851ae2": Object.freeze({
    mode: "own_product", product: "sports_card_bundle",
    research_run_id: "rv-f98394fe47851ae2",
    reviewed_title: "Fake chick Field guide for gum road", public_title: "The Fake-Check Field Guide",
    video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/1795818317360-4643.mp4",
  }),
  "rv-46e2ab7acda58ff9": Object.freeze({
    mode: "own_product", product: "sports_card_bundle",
    research_run_id: "rv-46e2ab7acda58ff9",
    reviewed_title: "The fake test field guide", public_title: "The Fake-Check Field Guide",
    video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/1795749758411-4643.mp4",
  }),
});

// Exact, stable aliases only: no fuzzy product or URL matching. The owner
// reviews the generated caption and destination on the existing Blue card.
const ALIASES = new Map([
  ["the fake check field guide", "fake_check"],
  ["fake check field guide", "fake_check"],
  ["sports card collecting series", "sports_card_bundle"],
  ["the sports card collecting series", "sports_card_bundle"],
]);

function automaticSelection(item) {
  const title = typeof item?.title === "string" ? item.title.trim().toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ") : "";
  // Accept a single explicit storefront suffix, never arbitrary extra text.
  const product = ALIASES.get(title.replace(/ (?:on|for|from|at) gumroad$/, ""));
  if (!product) return null;
  if (typeof item.video_url !== "string" || item.research_run_id !== `rv-${createHash("sha256").update(item.video_url).digest("hex").slice(0, 16)}`) {
    throw new Error("Automatic product selection requires the exact staged media identity");
  }
  return { mode: "own_product", product, research_run_id: item.research_run_id,
    reviewed_title: item.title, video_url: item.video_url };
}

export function createOwnProductPolicy(manifest = OWNER_PRODUCT_SELECTIONS, { automatic = false } = {}) {
  const selections = Object.freeze(Object.fromEntries(Object.entries(manifest).map(([id, selection]) => [id, Object.freeze({ ...selection })])));
  const hasRun = runId => typeof runId === "string" && RUN.test(runId) && Object.hasOwn(selections, runId);
  return Object.freeze({
    hasRun,
    forItem(item, channel) {
      const selection = hasRun(item?.research_run_id) ? selections[item.research_run_id] : automatic ? automaticSelection(item) : null;
      return selection ? buildOwnProductPromotion(item, selection, channel) : null;
    },
    forReceipt(runId, videoUrl, channel) {
      if (!hasRun(runId)) return null;
      const selection = selections[runId];
      return buildOwnProductPromotion({ research_run_id: runId, video_url: videoUrl,
        title: selection.reviewed_title, status: "approved" }, selection, channel);
    },
  });
}

export const ownProductPolicy = createOwnProductPolicy(OWNER_PRODUCT_SELECTIONS, { automatic: true });

// Bind automatic selection to an authenticated, exact queue row before any
// provider request. Receipt verification uses this same immutable in-run
// selection, never a caption supplied by Buffer or a client-provided URL.
export function bindOwnProductPolicy(item) {
  const selection = Object.hasOwn(OWNER_PRODUCT_SELECTIONS, item?.research_run_id)
    ? OWNER_PRODUCT_SELECTIONS[item.research_run_id] : automaticSelection(item);
  if (!selection) return createOwnProductPolicy({});
  buildOwnProductPromotion(item, selection, "youtube");
  return createOwnProductPolicy({ [item.research_run_id]: selection });
}

// Historical receipts need an observed approval state and the original title.
// Legacy affiliate snapshots do not carry these fields; do not infer a direct
// product from provider text or synthesize approval for an unapproved row.
export function bindHistoricalOwnProductPolicy(row) {
  const item = { ...row, title: row.reviewed_title };
  const selection = Object.hasOwn(OWNER_PRODUCT_SELECTIONS, item.research_run_id)
    ? OWNER_PRODUCT_SELECTIONS[item.research_run_id] : automaticSelection(item);
  if (!selection) return createOwnProductPolicy({});
  if (!["approved", "publishing", "published"].includes(row.status) || typeof row.reviewed_title !== "string") {
    throw new Error("Historical direct-product receipt requires recorded approval and reviewed title");
  }
  // Published is a legitimate later state, but never a new publishing input.
  buildOwnProductPromotion({ ...item, status: row.status === "published" ? "approved" : row.status }, selection, "youtube");
  return createOwnProductPolicy({ [item.research_run_id]: selection });
}

// Presentation only: the published feed stores the original reviewed title.
// Normalize known catalog titles for display without changing that stored
// identity, creating a promotion, exposing a link or verifying a receipt.
export function publicOwnProductDisplayTitle(row) {
  const original = row?.title;
  if (row?.status !== "published" || typeof original !== "string") return original;
  try {
    const policy = bindHistoricalOwnProductPolicy({ ...row, reviewed_title: original });
    return policy.forReceipt(row.research_run_id, row.video_url, "youtube")?.title ?? original;
  } catch {
    return original;
  }
}
