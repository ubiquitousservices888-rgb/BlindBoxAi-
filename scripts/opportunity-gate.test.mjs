import assert from "node:assert/strict";
import test from "node:test";

import {
  OPPORTUNITY_EVENT_SCHEMA,
  assertOpportunityPublishable,
  scoreOpportunity,
  validateOpportunityEvent,
} from "../lib/opportunity-gate.mjs";

function baseEvent(overrides = {}) {
  return {
    schema: OPPORTUNITY_EVENT_SCHEMA,
    productId: "hirono-example-series",
    brand: "POP MART",
    seriesName: "HIRONO Example Series",
    observedAt: "2026-08-16T12:00:00.000Z",
    soldEvidence: {
      count: 18,
      windowDays: 30,
      medianUSD: 86,
      sourceReviewed: true,
      checkedAt: "2026-08-16T12:00:00.000Z",
      sourceLabel: "reviewed marketplace sold evidence",
    },
    activeSupply: {
      count: 22,
      medianAskUSD: 92,
      checkedAt: "2026-08-16T12:00:00.000Z",
      sourceLabel: "reviewed active marketplace supply",
    },
    privateDemand: { repeatedQuestions: 8 },
    campaignHistory: { impressions: 500, clicks: 35, conversions: 2 },
    ...overrides,
  };
}

const NOW = new Date("2026-08-16T13:00:00.000Z");

test("high-quality opportunity deterministically publishes", () => {
  const result = scoreOpportunity(baseEvent(), { now: NOW });
  assert.equal(result.decision, "PUBLISH");
  assert.ok(result.score >= result.publishThreshold);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.evidence.campaignSampleQualified, true);
});

test("same input produces same score and components", () => {
  const first = scoreOpportunity(baseEvent(), { now: NOW });
  const second = scoreOpportunity(baseEvent(), { now: NOW });
  assert.equal(first.score, second.score);
  assert.deepEqual(first.components, second.components);
  assert.deepEqual(first.blockers, second.blockers);
});

test("stale evidence fails closed", () => {
  const event = baseEvent({
    observedAt: "2026-08-01T12:00:00.000Z",
    soldEvidence: {
      ...baseEvent().soldEvidence,
      checkedAt: "2026-08-01T12:00:00.000Z",
    },
    activeSupply: {
      ...baseEvent().activeSupply,
      checkedAt: "2026-08-01T12:00:00.000Z",
    },
  });
  const result = scoreOpportunity(event, { now: NOW });
  assert.equal(result.decision, "HOLD");
  assert.match(result.blockers.join(" "), /older than 7 days/i);
});

test("insufficient sold evidence fails closed", () => {
  const event = baseEvent({
    soldEvidence: { ...baseEvent().soldEvidence, count: 2 },
  });
  const result = scoreOpportunity(event, { now: NOW });
  assert.equal(result.decision, "HOLD");
  assert.match(result.blockers.join(" "), /fewer than 3/i);
});

test("campaign history below minimum sample earns no campaign points", () => {
  const event = baseEvent({ campaignHistory: { impressions: 99, clicks: 20, conversions: 2 } });
  const result = scoreOpportunity(event, { now: NOW });
  assert.equal(result.components.campaignSignal, 0);
  assert.equal(result.evidence.campaignSampleQualified, false);
});

test("raw eBay listing URLs are rejected anywhere in the event", () => {
  const event = baseEvent({
    activeSupply: {
      ...baseEvent().activeSupply,
      sourceLabel: "https://www.ebay.com/itm/1234567890",
    },
  });
  assert.throws(() => validateOpportunityEvent(event), /raw eBay listing URL/i);
});

test("publish assertion throws for held opportunities", () => {
  const event = baseEvent({ activeSupply: { ...baseEvent().activeSupply, count: 0 } });
  assert.throws(() => assertOpportunityPublishable(event, { now: NOW }), /Opportunity held/i);
});
