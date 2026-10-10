import assert from "node:assert/strict";
import test from "node:test";

import { reviewVideoLandingUrl } from "../lib/review-landing-url.mjs";
import { HAIR_SALON_MEDIA_URL, HAIR_SALON_TITLE, HAIR_SALON_SHA256, HAIR_SALON_REVIEW_PATH, REVIEW_OBJECT_PREFIX } from "../lib/hair-salon-asset.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";
import { ebayOutboundPath } from "../lib/data.js";

const item = {
  title: HAIR_SALON_TITLE,
  video_url: HAIR_SALON_MEDIA_URL,
  research_run_id: "rv-3c9c9bb78c37ff6a",
};

test("verified Hair Salon video leads to its guide with exact per-channel campaign tags", () => {
  assert.equal(reviewVideoLandingUrl(item),
    "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon");
  for (const source of ["youtube", "tiktok"]) {
    const tracked = new URL(buildTrackedSocialCta(reviewVideoLandingUrl(item), {
      runId: item.research_run_id, service: source,
    }));
    assert.equal(tracked.hostname, "www.blindboxai.com");
    assert.equal(tracked.pathname, "/series/labubu-the-monsters-hair-salon");
    assert.equal(tracked.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
    assert.equal(tracked.searchParams.get("source"), source);
    const epn = ebayOutboundPath("labubu-the-monsters-hair-salon", "Blow Dry", "active", {
      campaignId: tracked.searchParams.get("campaign"), source,
    });
    assert.match(epn, /^\/api\/out\/ebay\?/);
    assert.match(epn, /campaign=bb-rv-3c9c9bb78c37ff6a/);
    assert.ok(epn.includes(`source=${source}`));
  }
});

test("changed media or title cannot acquire the specialist Hair Salon CTA", () => {
  assert.equal(reviewVideoLandingUrl({ ...item, video_url: item.video_url.replace(".mp4", "-wrong.mp4") }),
    "https://www.blindboxai.com");
  assert.equal(reviewVideoLandingUrl({ ...item, title: "Another collectible" }),
    "https://www.blindboxai.com");
});

test("canonical Hair Salon URL derives from the one immutable asset manifest", () => {
  assert.equal(HAIR_SALON_SHA256, "7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0");
  assert.equal(HAIR_SALON_TITLE, "THE MONSTERS Hair Salon Series — Vinyl Plush Pendant Blind Box");
  assert.equal(REVIEW_OBJECT_PREFIX, "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/");
  assert.equal(HAIR_SALON_REVIEW_PATH, `media/review/sha256-${HAIR_SALON_SHA256}.mp4`);
  assert.equal(HAIR_SALON_MEDIA_URL, `${REVIEW_OBJECT_PREFIX}${HAIR_SALON_REVIEW_PATH}`);
});
