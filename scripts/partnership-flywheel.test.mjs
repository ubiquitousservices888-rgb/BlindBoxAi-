import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPartnershipSafety,
  buildPartnershipCandidate,
  partnershipScore,
  rankPartnershipOpportunities,
} from "../lib/partnership-flywheel.mjs";

const now = new Date("2026-09-03T12:00:00Z");
const opportunities = [
  {
    id: "inactive-youtube",
    name: "Inactive YouTube Lane",
    organization: "YouTube",
    type: "sponsorship_discovery",
    active: false,
    sourceUrl: "https://example.com/youtube",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Test-only inactive opportunity.",
    requirements: [],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "youtube"],
    riskFlags: ["inactive-by-owner"],
  },
  {
    id: "ambassador",
    name: "Collector Ambassador Program",
    organization: "Example Collector Marketplace",
    type: "ambassador_affiliate",
    active: true,
    sourceUrl: "https://example.com/ambassador",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public collector ambassador program.",
    requirements: ["review"],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "ambassador"],
    riskFlags: ["affiliate-not-sponsorship"],
  },
  {
    id: "affiliate",
    name: "Blind Box Affiliate Program",
    organization: "Example Collectibles Store",
    type: "affiliate",
    active: true,
    sourceUrl: "https://example.com/affiliate",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public blind-box affiliate program.",
    requirements: [],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "blind-box", "affiliate", "website"],
    riskFlags: ["affiliate-not-sponsorship"],
  },
];

test("inactive opportunities are excluded from ranking", () => {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms: ["collectibles", "youtube"], now });
  assert.equal(ranked.some(({ opportunity }) => opportunity.id === "inactive-youtube"), false);
});

test("non-YouTube collector opportunities rank normally", () => {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms: ["collectibles", "blind-box", "affiliate", "ambassador", "website"], now });
  assert.notEqual(ranked[0].opportunity.organization, "YouTube");
  assert.equal(ranked[0].opportunity.id, "affiliate");
});

test("candidate remains review-only and never auto-contacts", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.equal(candidate.contactAutomatically, false);
  assert.equal(candidate.applyAutomatically, false);
  assert.equal(candidate.spendAutomatically, false);
  assert.equal(candidate.seeker.status, "NO_CONTACT_SENT");
  assert.equal(candidate.selected.eligibilityStatus, "unknown");
  assert.notEqual(candidate.selected.organization, "YouTube");
});

test("safety rejects automatic outreach", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.contactAutomatically = true;
  assert.throws(() => assertPartnershipSafety(candidate), /must not auto-contact/);
});

test("safety rejects false endorsement claims", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.outreachBrief.positioning = "Official partner of Example Collectibles Store";
  assert.throws(() => assertPartnershipSafety(candidate), /blocked claim/);
});

test("selection-not-guaranteed receives the same risk penalty as equivalent flags", () => {
  const base = opportunities[2];
  const selection = { ...base, riskFlags: ["selection-not-guaranteed"] };
  const approval = { ...base, riskFlags: ["approval-not-guaranteed"] };
  assert.equal(partnershipScore(selection, { now }), partnershipScore(approval, { now }));
  assert.ok(partnershipScore(selection, { now }) < partnershipScore(base, { now }));
});
