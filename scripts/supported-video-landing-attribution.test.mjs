import assert from "node:assert/strict";
import test from "node:test";

import landingDocument from "../data/review-video-landings.json" with { type: "json" };
import { getSeries, ebayOutboundPath, epnCustomId } from "../lib/data.js";
import { resolveReadonlyEbayOutboundTarget } from "../lib/ebay-outbound-readonly.mjs";
import { reviewVideoLanding, qualifyingLanding } from "../lib/review-landing.mjs";
import { buildTrackedSocialCta } from "../lib/social-attribution.mjs";

const SAMPLE_RUN_ID = "rv-0123456789abcdef"; // synthetic test ID, NEVER an actual approved queue row
const MACARON_SLUG = "labubu-the-monsters-exciting-macaron";
const MACARON_LANDING = `/series/${MACARON_SLUG}`;

test("supported POP MART route exists but has no inferred owner video binding", () => {
  const candidate = qualifyingLanding(MACARON_LANDING);
  assert.equal(candidate?.topic, "pop_mart");
  const series = getSeries(MACARON_SLUG);
  assert.equal(series?.slug, MACARON_SLUG);
  assert.ok(series.figures.some((item) => item.name === "Blueberry Macaron"));
  // A local uploaded video has no approved Supabase run ID or canonical media binding.
  assert.equal(Object.hasOwn(landingDocument.landings, SAMPLE_RUN_ID), false);
  assert.equal(reviewVideoLanding({
    research_run_id: SAMPLE_RUN_ID,
    video_url: "https://not-a-canonical-review-object.invalid/example.mp4",
    vertical: "pop_mart",
    title: "Unpacking the Labubu Macaron Obsession",
  }).qualifies, false);
});

test("sample supported series retains campaign and source in first-party outbound and EPN URL", () => {
  const previousCampaign = process.env.NEXT_PUBLIC_EPN_CAMPID;
  // Deterministic LOCAL TEST fixture; no provider account call, publisher or outbound click.
  process.env.NEXT_PUBLIC_EPN_CAMPID = "5339171775";
  try {
    for (const platform of ["youtube", "tiktok"]) {
      const landing = new URL(buildTrackedSocialCta(`https://www.blindboxai.com${MACARON_LANDING}`, {
        runId: SAMPLE_RUN_ID,
        service: platform,
      }));
      const campaign = `bb-${SAMPLE_RUN_ID}`;
      assert.equal(landing.pathname, MACARON_LANDING);
      assert.equal(landing.searchParams.get("campaign"), campaign);
      assert.equal(landing.searchParams.get("source"), platform);

      const outbound = new URL(ebayOutboundPath(MACARON_SLUG, "Blueberry Macaron", "active", {
        campaignId: landing.searchParams.get("campaign"),
        source: landing.searchParams.get("source"),
      }), "https://www.blindboxai.com");

      assert.equal(outbound.pathname, "/api/out/ebay");
      assert.equal(outbound.searchParams.get("series"), MACARON_SLUG);
      assert.equal(outbound.searchParams.get("figure"), "Blueberry Macaron");
      assert.equal(outbound.searchParams.get("kind"), "active");
      assert.equal(outbound.searchParams.get("placement"), "series_table");
      assert.equal(outbound.searchParams.get("campaign"), campaign);
      assert.equal(outbound.searchParams.get("source"), platform);

      const resolved = resolveReadonlyEbayOutboundTarget({
        requestUrl: outbound.toString(),
        referer: landing.toString(),
      });
      assert.equal(resolved.status, 302, resolved.reason || "unexpected outbound rejection");
      assert.equal(resolved.campaignId, campaign);
      assert.equal(resolved.outboundSource, platform);
      assert.equal(resolved.customId, epnCustomId({
        seriesSlug: MACARON_SLUG, figure: "Blueberry Macaron",
        kind: "active", placement: "series_table",
        campaignId: campaign, source: platform,
      }));
      const target = new URL(resolved.target);
      assert.equal(target.protocol, "https:");
      assert.match(target.hostname, /(^|\.)ebay\.com$/);
      assert.equal(target.searchParams.get("campid"), "5339171775");
    }
  } finally {
    if (previousCampaign === undefined) delete process.env.NEXT_PUBLIC_EPN_CAMPID;
    else process.env.NEXT_PUBLIC_EPN_CAMPID = previousCampaign;
  }
});

test("an unmapped ID, altered media and off-topic vertical cannot borrow a mapped affiliate CTA", () => {
  for (const [runId, choice] of Object.entries(landingDocument.landings)) {
    assert.match(runId, /^rv-[a-f0-9]{16}$/);
    const reviewed = {
      research_run_id: runId, video_url: choice.video_url, vertical: choice.vertical,
    };
    assert.equal(reviewVideoLanding(reviewed).qualifies, true, runId);
    assert.equal(reviewVideoLanding({ ...reviewed, video_url: choice.video_url.replace(".mp4", "-altered.mp4") }).qualifies, false);
    assert.equal(reviewVideoLanding({ ...reviewed, vertical: "sports_cards" }).qualifies, false);
    assert.equal(reviewVideoLanding({ ...reviewed, research_run_id: SAMPLE_RUN_ID }).qualifies, false);
  }
  assert.equal(qualifyingLanding("/shop/accessories"), null, "Amazon accessories are not a verified EPN landing");
  assert.equal(qualifyingLanding("/guides/card-protection-before-grading"), null);
  assert.equal(qualifyingLanding("/guides/base-set-charizard"), null);
});
