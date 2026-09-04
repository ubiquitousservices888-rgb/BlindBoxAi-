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
  buildLegacyRollupLines,
  buildLegacyRollups,
  legacyRollupHeaders,
} from "./affiliate-click-report.mjs";

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

  it("keeps campaign attribution on the BlindBoxAI redirect", () => {
    const path = amazonOutboundPath("display-turntable", {
      campaignId: "fall_launch",
      source: "youtube",
    });
    const url = new URL(path, "https://blindboxai.com");
    assert.equal(url.pathname, "/api/out/amazon");
    assert.equal(url.searchParams.get("offer"), "display-turntable");
    assert.equal(url.searchParams.get("campaign"), "fall_launch");
    assert.equal(url.searchParams.get("source"), "youtube");
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

  it("sets an explicit accessible label including paid-link disclosure", () => {
    const pageSource = fs.readFileSync(
      new URL("../app/shop/accessories/page.jsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /rel="sponsored nofollow"/);
    assert.match(
      pageSource,
      /aria-label=\\{`Compare current Amazon options for \\$\\{offer\\.title\\} \\(paid link\\)`\\}/,
    );  });

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
