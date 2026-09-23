import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  AMAZON_ASSOCIATE_TAG,
  allAmazonAccessoryOffers,
  amazonOutboundPath,
  buildAmazonSearchUrl,
  getAmazonAccessoryOffer,
} from "../lib/amazon-associates.mjs";
import { affiliateReportRow, affiliateRollupKey } from "../lib/affiliate-reporting.mjs";
import {
  classifyAmazonBeaconRequest,
  handleAmazonAffiliateClick,
} from "../app/api/events/amazon-affiliate-click/route.js";
import {
  buildLegacyRollupLines,
  buildLegacyRollups,
  legacyRollupHeaders,
} from "./affiliate-click-report.mjs";

function beaconRequest({ headers = {}, body = {} } = {}) {
  return new Request("https://blindboxai.com/api/events/amazon-affiliate-click", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      offerId: "acrylic-display-case",
      campaignId: "fall_launch",
      source: "youtube",
      ...body,
    }),
  });
}

async function captureBeaconEvent({ headers = {}, classifier } = {}) {
  let scheduled = null;
  let recorded = null;
  const response = await handleAmazonAffiliateClick(beaconRequest({ headers }), {
    classifier,
    defer(callback) { scheduled = callback; },
    recorder: async (event) => { recorded = event; },
    now: () => new Date("2026-09-23T10:00:00.000Z"),
  });
  assert.equal(response.status, 204);
  assert.equal(typeof scheduled, "function");
  await scheduled();
  return recorded;
}

describe("Amazon Associates accessory path", () => {
  it("uses a fixed allowlist of evergreen accessory categories", () => {
    const offers = allAmazonAccessoryOffers();
    assert.ok(offers.length >= 5);
    assert.equal(new Set(offers.map((offer) => offer.id)).size, offers.length);
    assert.ok(offers.every((offer) => offer.searchQuery && offer.title && offer.useCase));
  });

  it("builds an Amazon search URL carrying the public associate tag", () => {
    const offer = getAmazonAccessoryOffer("acrylic-display-case");
    assert.ok(offer);

    const url = new URL(buildAmazonSearchUrl(offer.id));
    assert.equal(url.origin, "https://www.amazon.com");
    assert.equal(url.pathname, "/s");
    assert.equal(url.searchParams.get("k"), offer.searchQuery);
    assert.equal(url.searchParams.get("tag"), AMAZON_ASSOCIATE_TAG);
  });

  it("keeps the legacy redirect helper isolated from the video pipeline until compatibility cleanup", () => {
    const path = amazonOutboundPath("display-turntable", {
      campaignId: "fall_launch",
      source: "youtube",
    });
    const url = new URL(path, "https://blindboxai.com");
    assert.equal(url.pathname, "/api/out/amazon");
    assert.equal(url.searchParams.get("offer"), "display-turntable");
    assert.equal(url.searchParams.get("campaign"), "fall_launch");
    assert.equal(url.searchParams.get("source"), "youtube");

    const videoPipelineSource = fs.readFileSync(
      new URL("../lib/video-pipeline.mjs", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(videoPipelineSource, /amazonOutboundPath/);
    assert.match(videoPipelineSource, /AMAZON_VIDEO_CTA = "https:\/\/blindboxai\.com\/shop\/accessories"/);
  });

  it("primary Amazon shop links go directly to Amazon while first-party logging stays non-blocking", () => {
    const pageSource = fs.readFileSync(new URL("../app/shop/accessories/page.jsx", import.meta.url), "utf8");
    const linkSource = fs.readFileSync(new URL("../app/shop/accessories/AmazonAffiliateLink.jsx", import.meta.url), "utf8");
    const loggerSource = fs.readFileSync(new URL("../app/api/events/amazon-affiliate-click/route.js", import.meta.url), "utf8");

    assert.match(pageSource, /href=\{buildAmazonSearchUrl\(offer\.id\)\}/);
    assert.doesNotMatch(pageSource, /amazonOutboundPath\(/);
    assert.match(linkSource, /navigator\.sendBeacon/);
    assert.match(linkSource, /keepalive:\s*true/);
    assert.doesNotMatch(linkSource, /preventDefault\(|window\.location\.assign/);
    assert.match(loggerSource, /provider:\s*"amazon_associates"/);
    assert.match(loggerSource, /piiStored:\s*false/);
  });

  it("classifies Amazon beacon traffic with the shared click-quality values", () => {
    assert.deepEqual(
      classifyAmazonBeaconRequest(beaconRequest({ headers: { "user-agent": "Mozilla/5.0 Chrome/140 Safari/537.36" } })),
      { clientClass: "human_candidate", qualityReason: "default_candidate" },
    );
    assert.deepEqual(
      classifyAmazonBeaconRequest(beaconRequest({ headers: { "user-agent": "Googlebot/2.1" } })),
      { clientClass: "bot", qualityReason: "bot_signature" },
    );
    assert.deepEqual(
      classifyAmazonBeaconRequest(beaconRequest({ headers: { "sec-purpose": "prefetch", "user-agent": "Mozilla/5.0" } })),
      { clientClass: "prefetch", qualityReason: "prefetch_header" },
    );
  });

  it("fails human counting closed when the classifier throws while the beacon still succeeds", async () => {
    const event = await captureBeaconEvent({
      headers: { "user-agent": "Mozilla/5.0" },
      classifier() { throw new Error("classifier unavailable"); },
    });
    assert.equal(event.clientClass, "unclassified");
    assert.equal(event.qualityReason, "classifier_error");
    assert.equal(event.provider, "amazon_associates");
    assert.equal(event.sourcePath, "/shop/accessories");
    assert.equal(event.metadata.directProviderLink, true);
  });

  it("stores bot and prefetch beacon events instead of dropping them", async () => {
    const bot = await captureBeaconEvent({ headers: { "user-agent": "Googlebot/2.1" } });
    assert.equal(bot.clientClass, "bot");
    assert.equal(bot.qualityReason, "bot_signature");

    const prefetch = await captureBeaconEvent({
      headers: { "sec-purpose": "prefetch", "user-agent": "Mozilla/5.0" },
    });
    assert.equal(prefetch.clientClass, "prefetch");
    assert.equal(prefetch.qualityReason, "prefetch_header");
  });

  it("preserves the existing direct-provider beacon payload and matches eBay quality field names", () => {
    const amazonRouteSource = fs.readFileSync(
      new URL("../app/api/events/amazon-affiliate-click/route.js", import.meta.url),
      "utf8",
    );
    const ebayRouteSource = fs.readFileSync(
      new URL("../app/api/out/ebay/route.js", import.meta.url),
      "utf8",
    );

    for (const field of ["clientClass", "qualityReason"]) {
      assert.match(amazonRouteSource, new RegExp(`${field}: clickQuality\\.${field}`));
      assert.match(ebayRouteSource, new RegExp(`${field}: clickQuality\\.${field}`));
    }
    assert.match(amazonRouteSource, /directProviderLink:\s*true/);
    assert.match(amazonRouteSource, /provider:\s*"amazon_associates"/);
    assert.match(amazonRouteSource, /sourcePath:\s*"\/shop\/accessories"/);
  });

  it("rejects unknown offer ids instead of becoming an open redirect", () => {
    assert.throws(() => buildAmazonSearchUrl("anything-goes"), /not found/i);
  });

  it("rolls Amazon clicks up by provider, offer, source, and campaign", () => {
    const event = {
      provider: "amazon_associates",
      offerId: "display-turntable",
      offerTitle: "Motorized display turntables",
      source: "youtube",
      campaignId: "fall_launch",
      clickedAt: "2026-09-03T23:00:00.000Z",
    };

    assert.equal(
      affiliateRollupKey(event),
      "amazon_associates:offer:display-turntable:source:youtube:campaign:fall_launch",
    );
    assert.deepEqual(affiliateReportRow(event), {
      provider: "amazon_associates",
      customId: "",
      offerId: "display-turntable",
      offerTitle: "Motorized display turntables",
      seriesSlug: "",
      seriesName: "",
      figure: "",
      kind: "",
      placement: "",
      source: "youtube",
      campaignId: "fall_launch",
      sourcePath: "",
      clickedAt: "2026-09-03T23:00:00.000Z",
    });
  });

  it("preserves eBay custom ID reporting behavior", () => {
    const event = { customId: "twinkle-youtube-001", source: "youtube" };
    assert.equal(
      affiliateRollupKey(event),
      "ebay_epn:custom:twinkle-youtube-001:source:youtube:campaign:none",
    );
    assert.equal(affiliateReportRow(event).customId, "twinkle-youtube-001");

    const otherCampaign = { ...event, campaignId: "fall_launch" };
    assert.notEqual(affiliateRollupKey(event), affiliateRollupKey(otherCampaign));
  });

  it("uses eBay live context fields in rollups and report rows", () => {
    const event = {
      contextType: "live",
      contextId: "stream-42",
      itemId: "item-77",
      source: "youtube",
      campaignId: "fall_launch",
    };

    assert.equal(
      affiliateRollupKey(event),
      "ebay_epn:offer:live:stream-42:item-77:source:youtube:campaign:fall_launch",
    );
    assert.equal(affiliateReportRow(event).provider, "ebay_epn");
    assert.equal(affiliateReportRow(event).offerId, "live:stream-42:item-77");
  });

  it("sets an explicit Amazon destination label including paid-link disclosure", () => {
    const pageSource = fs.readFileSync(
      new URL("../app/shop/accessories/page.jsx", import.meta.url),
      "utf8",
    );

    assert.match(
      pageSource,
      /ariaLabel=\{`View \$\{offer\.title\} on Amazon \(paid link\)`\}/,
    );
    assert.match(pageSource, /View on Amazon →/);
    assert.match(pageSource, /As an Amazon Associate I earn from qualifying purchases/);
  });

  it("aggregates legacy custom IDs independently of modern attribution dimensions", () => {
    const events = [
      {
        customId: "cid-1",
        source: "youtube",
        campaignId: "spring",
        clickedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        customId: "cid-1",
        source: "tiktok",
        campaignId: "fall",
        clickedAt: "2026-09-01T01:00:00.000Z",
      },
    ];

    const rollups = buildLegacyRollups(events);
    assert.equal(rollups.size, 1);
    assert.equal(rollups.get("cid-1").clicks, 2);
  });

  it("keeps customid-rollup compatibility output in legacy 11-column order", () => {
    const rollups = new Map([
      ["legacy", {
        customId: "cid-1",
        seriesSlug: "series-a",
        seriesName: "Series A",
        figure: "figure-a",
        kind: "listing",
        placement: "hero",
        source: "youtube",
        campaignId: "fall",
        clicks: 2,
        firstClick: "2026-09-01T00:00:00.000Z",
        lastClick: "2026-09-01T01:00:00.000Z",
      }],
    ]);

    const [headerLine, valueLine] = buildLegacyRollupLines(rollups);
    const expectedHeaders = legacyRollupHeaders.join(",");

    assert.equal(expectedHeaders.split(",").length, 11);
    assert.equal(headerLine, expectedHeaders);
    assert.equal(
      valueLine,
      "cid-1,series-a,Series A,figure-a,listing,hero,youtube,fall,2,2026-09-01T00:00:00.000Z,2026-09-01T01:00:00.000Z",
    );
  });
});
