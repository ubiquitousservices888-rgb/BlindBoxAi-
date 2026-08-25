import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DISCLOSURE,
  buildEligibleProduct,
  createCandidate,
  validateCandidateHash,
} from "../lib/daily-product-pipeline.mjs";
import {
  assertCandidateCtas,
  hardenCandidateForPublishing,
} from "../lib/daily-product-publish-safety.mjs";
import {
  applySocialAttribution,
  buildTrackedSocialCta,
} from "../lib/social-attribution.mjs";

function eligibleSeries() {
  return {
    slug: "attribution-test",
    name: "Attribution Test Series",
    brand: "POP MART",
    figures: [
      {
        name: "Reviewed Figure",
        rarity: "common",
        resaleLow: 20,
        resaleHigh: 30,
        needsReview: false,
        evidence: "Two reviewed US sold transactions at positive USD prices.",
      },
    ],
    checklist: [],
    _dataQuality: {},
  };
}

describe("social attribution", () => {
  it("keeps tracked CTAs on BlindBoxAI and adds compact campaign/source tags", () => {
    const tracked = buildTrackedSocialCta(
      "https://www.blindboxai.com/series/attribution-test",
      { runId: "32799190157", service: "twitter" },
    );
    const url = new URL(tracked);
    assert.equal(url.hostname, "www.blindboxai.com");
    assert.equal(url.pathname, "/series/attribution-test");
    assert.equal(url.searchParams.get("campaign"), "bb-32799190157");
    assert.equal(url.searchParams.get("source"), "twitter");
  });

  it("refuses attribution URLs outside BlindBoxAI", () => {
    assert.throws(
      () => buildTrackedSocialCta("https://www.ebay.com/", { runId: "1", service: "twitter" }),
      /must remain on BlindBoxAI HTTPS/i,
    );
  });

  it("survives production hardening while preserving disclosure and per-channel source", () => {
    const product = buildEligibleProduct(eligibleSeries());
    const candidate = createCandidate(product, {
      runId: "32799190157",
      sourceCommit: "abc123",
      now: new Date("2026-08-25T04:00:00.000Z"),
    });
    const attributed = applySocialAttribution(candidate);

    for (const [service, text] of Object.entries(attributed.captions)) {
      assert.ok(text.includes(candidate.ctaUrl), `${service}: base CTA identity must remain present`);
      assert.ok(text.includes("campaign=bb-32799190157"), `${service}: campaign tag missing`);
      assert.ok(text.includes(`source=${service}`), `${service}: source tag missing`);
      assert.ok(text.includes(DISCLOSURE), `${service}: disclosure missing`);
      assert.ok(!/ebay\.com\//i.test(text), `${service}: raw eBay URL leaked into social copy`);
    }

    const hardened = hardenCandidateForPublishing(attributed);
    assertCandidateCtas(hardened);
    validateCandidateHash(hardened);
    assert.equal(hardened.captions.pinterest, undefined);

    for (const [service, text] of Object.entries(hardened.captions)) {
      assert.ok(text.includes("campaign=bb-32799190157"), `${service}: hardening removed campaign tag`);
      assert.ok(text.includes(`source=${service}`), `${service}: hardening removed source tag`);
      assert.ok(text.includes(DISCLOSURE), `${service}: hardening removed disclosure`);
    }
  });
});
