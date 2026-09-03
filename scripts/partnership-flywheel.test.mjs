import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPartnershipSafety,
  buildPartnershipCandidate,
  rankPartnershipOpportunities,
} from "../lib/partnership-flywheel.mjs";

const now = new Date("2026-09-03T12:00:00Z");
const opportunities = [
  {
    id: "sponsor",
    name: "Sponsor Discovery",
    organization: "Example Sponsor Platform",
    type: "sponsorship_discovery",
    sourceUrl: "https://example.com/sponsor",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public sponsor discovery program.",
    requirements: ["review"],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles", "youtube", "shorts"],
    riskFlags: ["eligibility-must-be-verified"],
  },
  {
    id: "affiliate",
    name: "Affiliate Program",
    organization: "Example Marketplace",
    type: "affiliate",
    sourceUrl: "https://example.com/affiliate",
    checkedAt: "2026-09-03T11:00:00Z",
    evidence: "Verified public affiliate program.",
    requirements: [],
    eligibilityStatus: "unknown",
    fitTags: ["collectibles"],
    riskFlags: ["affiliate-not-sponsorship"],
  },
];

test("sponsorship discovery ranks above affiliate when fit is comparable", () => {
  const ranked = rankPartnershipOpportunities(opportunities, { focusTerms: ["collectibles", "youtube", "shorts"] });
  assert.equal(ranked[0].opportunity.id, "sponsor");
});

test("candidate remains review-only and never auto-contacts", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.equal(candidate.contactAutomatically, false);
  assert.equal(candidate.applyAutomatically, false);
  assert.equal(candidate.spendAutomatically, false);
  assert.equal(candidate.seeker.status, "NO_CONTACT_SENT");
  assert.equal(candidate.selected.eligibilityStatus, "unknown");
});

test("safety rejects automatic outreach", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.contactAutomatically = true;
  assert.throws(() => assertPartnershipSafety(candidate), /must not auto-contact/);
});

test("safety rejects false endorsement claims", () => {
  const candidate = buildPartnershipCandidate(opportunities, { date: now });
  candidate.outreachBrief.positioning = "Official partner of Example Sponsor Platform";
  assert.throws(() => assertPartnershipSafety(candidate), /blocked claim/);
});
