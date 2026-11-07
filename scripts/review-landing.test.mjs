import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import landingDocument from "../data/review-video-landings.json" with { type: "json" };
import { HAIR_SALON_MEDIA_URL, HAIR_SALON_TITLE } from "../lib/hair-salon-asset.mjs";
import { MEW_30TH_CARDS, mew30thOutboundPath } from "../lib/mew-30th-comparison.mjs";
import { QUALIFYING_GUIDES, QUALIFYING_SERIES, qualifyingLanding, reviewVideoLanding } from "../lib/review-landing.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const approveRoute = read("../app/api/owner/approve-review/route.js");
const queueRoute = read("../app/api/owner/review-queue/route.js");
const dashboard = read("../app/owner-dashboard/DashboardClient.jsx");
const mewPage = read("../app/guides/mew-ex-152-vs-158/page.jsx");

test("qualifying series list matches the series pages that exist", () => {
  const onDisk = readdirSync(new URL("../data/series/", import.meta.url))
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
  assert.deepEqual([...QUALIFYING_SERIES].sort(), onDisk);
});

test("the homepage and unknown pages never qualify as an affiliate landing", () => {
  for (const value of ["/", "", "/price/x", "/series/not-a-real-series", "/guides/unknown", "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon"]) {
    assert.equal(qualifyingLanding(value), null, value);
  }
});

test("every owner-chosen landing is bound to exact media and a qualifying page", () => {
  const entries = Object.entries(landingDocument.landings);
  assert.ok(entries.length > 0);
  for (const [runId, choice] of entries) {
    assert.match(runId, /^rv-[a-f0-9]{16}$/);
    assert.match(choice.video_url, /^https:\/\/lazzdoadoqzrzlarerfx\.supabase\.co\/storage\/v1\/object\/public\/blindboxai-review-videos\/media\/review\/[^/]+\.mp4$/);
    assert.ok(qualifyingLanding(choice.path), `${runId} -> ${choice.path}`);
  }
});

test("landing follows the chosen page only for the exact media and a matching topic", () => {
  const pokemon = {
    research_run_id: "rv-9c5d343830fb30a8",
    vertical: "pokemon_tcg",
    video_url: landingDocument.landings["rv-9c5d343830fb30a8"].video_url,
  };
  const chosen = reviewVideoLanding(pokemon);
  assert.equal(chosen.qualifies, true);
  assert.equal(chosen.url, "https://www.blindboxai.com/guides/mew-ex-152-vs-158");
  assert.equal(reviewVideoLanding({ ...pokemon, video_url: `${pokemon.video_url}?v=2` }).qualifies, false);
  assert.equal(reviewVideoLanding({ ...pokemon, vertical: "pop_mart" }).qualifies, false);
  assert.equal(reviewVideoLanding({ ...pokemon, research_run_id: "rv-0000000000000000" }).qualifies, false);
  assert.equal(reviewVideoLanding({}).qualifies, false);
  const hairSalon = reviewVideoLanding({ title: HAIR_SALON_TITLE, video_url: HAIR_SALON_MEDIA_URL });
  assert.equal(hairSalon.qualifies, true);
  assert.equal(hairSalon.url, "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon");
});

test("Mew guide links keep a video's campaign tag and otherwise credit the guide", () => {
  assert.ok(QUALIFYING_GUIDES["/guides/mew-ex-152-vs-158"]);
  for (const card of MEW_30TH_CARDS) {
    for (const source of ["youtube", "tiktok"]) {
      const tagged = new URL(mew30thOutboundPath(card, { campaignId: "bb-rv-9c5d343830fb30a8", source }), "https://www.blindboxai.com");
      assert.equal(tagged.pathname, "/api/out/price-item");
      assert.equal(tagged.searchParams.get("campaign"), "bb-rv-9c5d343830fb30a8");
      assert.equal(tagged.searchParams.get("source"), source);
    }
    const plain = new URL(mew30thOutboundPath(card), "https://www.blindboxai.com");
    assert.equal(plain.searchParams.get("campaign"), null);
    assert.equal(plain.searchParams.get("source"), "mew_30th_guide");
    const unsafe = new URL(mew30thOutboundPath(card, { campaignId: "bad id!", source: "youtube" }), "https://www.blindboxai.com");
    assert.equal(unsafe.searchParams.get("campaign"), null);
  }
  assert.match(mewPage, /export const dynamic = "force-dynamic";/);
  assert.match(mewPage, /const query = await searchParams;/);
  assert.match(mewPage, /mew30thOutboundPath\(card, attribution\)/);
});

test("approval re-checks the exact row and its caption on the server before approving", () => {
  const listAt = approveRoute.indexOf('action: "list", includeApproved: true');
  const previewAt = approveRoute.indexOf("reviewCaptionPreview(row)");
  const approveAt = approveRoute.indexOf('action: "approve"');
  assert.ok(listAt > 0 && previewAt > listAt && approveAt > previewAt);
  assert.match(approveRoute, /item\?\.research_run_id === researchRunId && item\?\.video_url === videoUrl/);
  assert.match(approveRoute, /reviewedTitle !== String\(row\.title \?\? ""\)/);
  assert.match(approveRoute, /status: 422/);
  assert.match(approveRoute, /blocked_caption/);
  assert.match(queueRoute, /action: "list", includeApproved: true/);
});

test("dashboard lists approved-but-unpublished videos with a guarded Publish now", () => {
  assert.match(dashboard, /Approved, not published yet/);
  assert.match(dashboard, /item\?\.status === "approved"/);
  assert.match(dashboard, /PUBLISH NOW/);
  assert.match(dashboard, /disabled=\{!captionReady \|\| !validAudience/);
  assert.match(dashboard, /reviewedTitle: item\.title/);
  assert.match(dashboard, /approveReviewVideo\(item\.mediaUrl, item\.researchRunId, item\.title\)/);
  assert.match(dashboard, /Affiliate page: \{entry\.landing\}/);
});
