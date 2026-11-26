import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnProductPromotion } from "../lib/review-own-product.mjs";

const item = { research_run_id: "rv-0123456789abcdef", title: "Reviewed fixture", status: "ready_for_review",
  video_url: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/fixture.mp4" };
const selection = { mode: "own_product", product: "fake_check", research_run_id: item.research_run_id,
  reviewed_title: item.title, video_url: item.video_url };

test("each explicit product gets only its own Gumroad link on both primary channels", () => {
  for (const [product, slug] of [["fake_check", "bjfpgf"], ["sports_card_bundle", "fxloos"]]) {
    for (const channel of ["youtube", "tiktok"]) {
      const result = buildOwnProductPromotion(item, { ...selection, product }, channel);
      const url = `https://ubiquity6.gumroad.com/l/${slug}`;
      assert.equal(result.url, url);
      assert.deepEqual(result.caption.match(/https:\/\/\S+/g), [url]);
      assert.doesNotMatch(result.caption, /affiliate|ebay|amazon/i);
      assert.equal(result.revenueSource, "gumroad");
      assert.equal(result.source, channel);
    }
  }
});
test("unknown modes, products and channels are blocked", () => {
  for (const choice of [null, { ...selection, mode: "affiliate" }, { ...selection, product: "https://evil.example" }, { ...selection, product: "constructor" }]) {
    assert.throws(() => buildOwnProductPromotion(item, choice, "youtube"));
  }
  assert.throws(() => buildOwnProductPromotion(item, selection, "twitter"));
});
test("changed media, title, run or rejected state cannot qualify", () => {
  for (const patch of [{ video_url: item.video_url.replace("fixture", "replacement") }, { title: "Changed" },
    { research_run_id: "rv-1111111111111111" }, { status: "rejected" }, { status: "published" }]) {
    assert.throws(() => buildOwnProductPromotion({ ...item, ...patch }, selection, "youtube"));
  }
});
test("even matching selections cannot permit unapproved media hosts or URL forms", () => {
  for (const video_url of [item.video_url.replace("supabase.co", "supabase.co.evil.example"), item.video_url + "?token=fixture",
    item.video_url.replace("https://", "https://user@"), item.video_url.replace(".mp4", ".jpg")]) {
    assert.throws(() => buildOwnProductPromotion({ ...item, video_url }, { ...selection, video_url }, "tiktok"));
  }
});
