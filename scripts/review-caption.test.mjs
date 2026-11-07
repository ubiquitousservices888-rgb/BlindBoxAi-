import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DISCLOSURE, videoCaptionForService } from "../lib/video-pipeline.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";
import { reviewVideoLandingUrl } from "../lib/review-landing-url.mjs";
import { resolvePublicVideoTitle } from "../lib/public-video-title.mjs";
import { HAIR_SALON_MEDIA_URL, HAIR_SALON_TITLE } from "../lib/hair-salon-asset.mjs";
import {
  REVIEW_CAPTION_CHANNELS,
  buildReviewCaption,
  reviewCaptionPreview,
} from "../lib/review-caption.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const publisher = read("../scripts/publish-approved-review-queue.mjs");
const route = read("../app/api/owner/review-queue/route.js");
const dashboard = read("../app/owner-dashboard/DashboardClient.jsx");

const ITEMS = [
  { research_run_id: "rv-9c5d343830fb30a8", title: "Pokémon Card Rarity: Don't Mistake Common for Rare", vertical: "pokemon_tcg", status: "approved", video_url: "https://example.invalid/a.mp4" },
  { research_run_id: "rv-0123456789abcdef", title: "Straight Facts", vertical: "other_collectible", status: "ready_for_review", video_url: "https://example.invalid/b.mp4" },
  { research_run_id: "rv-e8f9341fca0fa7d6", title: "2181", vertical: "pokemon_tcg", status: "approved", video_url: "https://example.invalid/c.mp4" },
  { research_run_id: "rv-3c9c9bb78c37ff6a", title: HAIR_SALON_TITLE, vertical: "blind_box", status: "approved", video_url: HAIR_SALON_MEDIA_URL },
];

// Frozen copy of the caption construction the publisher used before it was
// moved into lib/review-caption.mjs (main bc30d5b). Output must not change.
function legacyCaption(item, channel) {
  const publicTitle = resolvePublicVideoTitle(item.title, { vertical: item.vertical, researchRunId: item.research_run_id, maxLength: 100 });
  const trackedCta = buildTrackedSocialCta(reviewVideoLandingUrl(item), { runId: item.research_run_id, service: channel });
  const script = {
    title: publicTitle,
    facts: [item.vertical === "pokemon_tcg" ? "Pokémon collectible research." : "Owner-reviewed BlindBoxAI collectible research."],
    productUrl: trackedCta,
  };
  return { trackedCta, caption: videoCaptionForService(script, channel) };
}

test("shared review caption is byte-identical to the previous publisher construction", () => {
  for (const item of ITEMS) {
    for (const channel of REVIEW_CAPTION_CHANNELS) {
      const built = buildReviewCaption(item, channel);
      const legacy = legacyCaption(item, channel);
      assert.equal(built.caption, legacy.caption, `${item.research_run_id}:${channel}`);
      assert.equal(built.trackedCta, legacy.trackedCta, `${item.research_run_id}:${channel}`);
    }
  }
});

test("owner preview shows the tracked BlindBoxAI link and disclosure per channel", () => {
  for (const item of ITEMS) {
    const preview = reviewCaptionPreview(item);
    assert.deepEqual(preview.map((entry) => entry.channel), ["youtube", "tiktok"]);
    for (const entry of preview) {
      assert.equal(entry.ok, true);
      assert.deepEqual(Object.keys(entry).sort(), ["caption", "channel", "link", "ok", "title"]);
      const link = new URL(entry.link);
      assert.equal(link.protocol, "https:");
      assert.match(link.hostname, /^(www\.)?blindboxai\.com$/);
      assert.equal(link.searchParams.get("source"), entry.channel);
      assert.ok(link.searchParams.get("campaign"));
      assert.ok(entry.caption.includes(entry.link));
      assert.ok(entry.caption.includes(DISCLOSURE));
      assert.equal(entry.caption, buildReviewCaption(item, entry.channel).caption);
    }
  }
  const hairSalon = reviewCaptionPreview(ITEMS[3]);
  assert.ok(hairSalon.every((entry) => new URL(entry.link).pathname === "/series/labubu-the-monsters-hair-salon"));
});

test("owner preview never throws and blocks a row it cannot build safely", () => {
  const preview = reviewCaptionPreview({ title: "No run id", status: "approved" });
  assert.equal(preview.length, 2);
  for (const entry of preview) {
    assert.equal(entry.ok, false);
    assert.deepEqual(Object.keys(entry).sort(), ["channel", "error", "ok"]);
  }
});

test("publisher, owner route and approval card all use the shared caption builder", () => {
  assert.match(publisher, /from "\.\.\/lib\/review-caption\.mjs"/);
  assert.match(publisher, /buildReviewCaption\(item, channel, publicTitle\)/);
  assert.doesNotMatch(publisher, /videoCaptionForService|buildTrackedSocialCta/);
  assert.match(route, /reviewCaptionPreview\(item\)/);
  assert.match(route, /\["ready_for_review", "approved"\]/);
  assert.match(dashboard, /caption_preview/);
  assert.match(dashboard, /What will post \(read-only\)/);
  assert.match(dashboard, /!captionReady/);
});
