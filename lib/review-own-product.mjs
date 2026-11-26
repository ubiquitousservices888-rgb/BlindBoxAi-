// Pure policy for owner-authorized direct-product promotions. Not a publisher.
// A trusted server-side manifest must bind the exact reviewed run and media.
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
  const media = new URL(item.video_url);
  if (media.protocol !== "https:" || media.username || media.password || media.port || media.search || media.hash ||
      media.hostname !== "lazzdoadoqzrzlarerfx.supabase.co" ||
      !/^\/storage\/v1\/object\/public\/blindboxai-review-videos\/media\/review\/[a-zA-Z0-9_-]+\.mp4$/.test(media.pathname)) {
    throw new Error("Approved review media required");
  }
  const product = PRODUCTS[selection.product];
  const caption = `${product.title}\nOur digital collecting resource. Get it on Gumroad:\n${product.url}`;
  return { mode: "own_product", channel, title: product.title, caption, url: product.url,
    campaignId: `bb-${item.research_run_id}`, source: channel, revenueSource: "gumroad" };
}
