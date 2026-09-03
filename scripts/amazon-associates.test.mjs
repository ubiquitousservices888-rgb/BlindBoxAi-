import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AMAZON_ASSOCIATE_TAG,
  allAmazonAccessoryOffers,
  amazonOutboundPath,
  buildAmazonSearchUrl,
  getAmazonAccessoryOffer,
} from "../lib/amazon-associates.mjs";

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
});
