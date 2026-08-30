import assert from "node:assert/strict";
import test from "node:test";
import {
  AFFILIATE_DISCLOSURE,
  BLINDBOXAI_URL,
  FAN_STORY_DISCLOSURE,
  assertNarrativeSafety,
  buildNarrativeCandidate,
  selectNarrativeSeries,
} from "../lib/narrative-flywheel.mjs";
import {
  UES_BUSINESS_NAME,
  UES_NETWORK_DISCLOSURE,
  assertUesNetworkSafety,
  buildUesNetworkCandidate,
} from "../lib/ues-network-flywheel.mjs";

const twinkle = {
  slug: "twinkle-test",
  name: "Twinkle Twinkle Test Plush",
  brand: "Pop Mart",
  automationPriority: 2,
  marketSelection: {
    priorityIp: "Twinkle Twinkle",
    completedSalesStatus: "verified",
    autoPromote: false,
  },
  figures: [
    {
      name: "Secret Goodnight",
      needsReview: false,
      evidence: "Reviewed completed transaction for test fixture.",
    },
  ],
};

const other = {
  slug: "other-test",
  name: "Other Series",
  brand: "Example Brand",
  automationPriority: 1,
  marketSelection: {
    priorityIp: "Other",
    completedSalesStatus: "verified",
    autoPromote: true,
  },
  figures: [
    {
      name: "Other Figure",
      needsReview: false,
      evidence: "Reviewed completed transaction for test fixture.",
    },
  ],
};

test("Twinkle is preferred for narrative staging", () => {
  const selected = selectNarrativeSeries([other, twinkle], { priorityTerms: ["twinkle"] });
  assert.equal(selected.slug, twinkle.slug);
});

test("candidate stops at review and keeps public CTA on BlindBoxAI", () => {
  const candidate = buildNarrativeCandidate(twinkle, { date: new Date("2026-08-29T12:00:00Z") });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.equal(candidate.publishAutomatically, false);
  assert.equal(candidate.publicCta, BLINDBOXAI_URL);
  assert.match(candidate.caption, new RegExp(FAN_STORY_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(candidate.caption, new RegExp(AFFILIATE_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(candidate.caption, /(?:https?:\/\/)?(?:www\.)?(?:ebay|amazon)\./i);
});

test("unverified series cannot enter the narrative loop", () => {
  const unverified = structuredClone(twinkle);
  unverified.marketSelection.completedSalesStatus = "unverified";
  assert.throws(() => buildNarrativeCandidate(unverified), /completed sales must be verified/);
});

test("evidence requires an explicit reviewed state", () => {
  const missingReviewState = structuredClone(twinkle);
  delete missingReviewState.figures[0].needsReview;
  assert.throws(() => buildNarrativeCandidate(missingReviewState), /reviewed evidence-backed figure/);
});

test("financial-promotion language is rejected", () => {
  const candidate = buildNarrativeCandidate(twinkle, { date: new Date("2026-08-29T12:00:00Z") });
  candidate.caption = `${candidate.caption}\nGuaranteed profit.`;
  assert.throws(() => assertNarrativeSafety(candidate), /blocked financial language/);
});

test("price-prediction language is rejected", () => {
  const candidate = buildNarrativeCandidate(twinkle, { date: new Date("2026-08-29T12:00:00Z") });
  candidate.caption = `${candidate.caption}\nPrice prediction: this figure will double.`;
  assert.throws(() => assertNarrativeSafety(candidate), /blocked financial language/);
});

test("legitimate product names do not trigger financial-promotion rules", () => {
  const moonSeries = structuredClone(twinkle);
  moonSeries.slug = "moon-rabbit-test";
  moonSeries.name = "Moon Garden Series";
  moonSeries.figures[0].name = "Moon Rabbit";
  assert.doesNotThrow(() => buildNarrativeCandidate(moonSeries, { date: new Date("2026-08-29T12:00:00Z") }));
});

test("raw merchant links are rejected with or without protocol", () => {
  for (const merchantUrl of [
    "https://www.ebay.com/itm/123",
    "https://ebay.com",
    "ebay.com/itm/123",
    "www.amazon.com/dp/example",
  ]) {
    const candidate = buildNarrativeCandidate(twinkle, { date: new Date("2026-08-29T12:00:00Z") });
    candidate.caption = `${candidate.caption}\n${merchantUrl}`;
    assert.throws(() => assertNarrativeSafety(candidate), /raw merchant URLs/);
  }
});

test("UES connection candidate is review-only and identifies the business", () => {
  const candidate = buildUesNetworkCandidate({ date: new Date("2026-08-29T12:00:00Z") });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.equal(candidate.publishAutomatically, false);
  assert.equal(candidate.publicCta, BLINDBOXAI_URL);
  assert.equal(candidate.business, UES_BUSINESS_NAME);
  assert.match(candidate.caption, new RegExp(UES_BUSINESS_NAME));
  assert.match(candidate.caption, new RegExp(UES_NETWORK_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(candidate.caption, new RegExp(AFFILIATE_DISCLOSURE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(candidate.caption, /(?:https?:\/\/)?(?:www\.)?(?:ebay|amazon)\./i);
});

test("UES connection candidate rejects outcome guarantees", () => {
  const candidate = buildUesNetworkCandidate({ date: new Date("2026-08-29T12:00:00Z") });
  candidate.caption = `${candidate.caption}\nThis is guaranteed to go viral.`;
  assert.throws(() => assertUesNetworkSafety(candidate), /blocked promise language/);
});

test("UES connection candidate rejects instant-money promises", () => {
  for (const promise of ["instant money", "instant-money"]) {
    const candidate = buildUesNetworkCandidate({ date: new Date("2026-08-29T12:00:00Z") });
    candidate.caption = `${candidate.caption}\nThis creates ${promise}.`;
    assert.throws(() => assertUesNetworkSafety(candidate), /blocked promise language/);
  }
});

test("UES connection candidate cannot auto-publish", () => {
  const candidate = buildUesNetworkCandidate({ date: new Date("2026-08-29T12:00:00Z") });
  candidate.publishAutomatically = true;
  assert.throws(() => assertUesNetworkSafety(candidate), /must not auto-publish/);
});
