import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AMAZON_ASSOCIATE_TAG,
  allAmazonAccessoryOffers,
  amazonOutboundPath,
  buildAmazonSearchUrl,
  getAmazonAccessoryOffer,
} from "../lib/amazon-associates.mjs";
import { affiliateReportRow, affiliateRollupKey } from "../lib/affiliate-reporting.mjs";

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
      "ebay_epn:custom:twinkle-youtube-001",
    );
    assert.equal(affiliateReportRow(event).customId, "twinkle-youtube-001");
  });
});
