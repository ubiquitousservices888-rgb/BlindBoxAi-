import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { aggregateFunnel, conversionRate } from "../lib/funnel-events.mjs";
import { normalizeLookbackDays } from "../lib/owner-dashboard-core.mjs";

function production(event, extra = {}) {
  return { namespace: "production", test: false, status: "observed", event, ...extra };
}

test("test and demo events never enter production KPIs", () => {
  const result = aggregateFunnel([
    production("page_view"),
    { namespace: "test", test: true, event: "page_view", status: "observed" },
    { namespace: "production", test: true, event: "provider_conversion", status: "provider_confirmed", provider: "ebay_epn", providerEvidenceId: "fake", confirmedRevenueUSD: 9999 },
  ]);
  assert.equal(result.pageViews, 1);
  assert.equal(result.providerConfirmedConversions, 0);
  assert.equal(result.confirmedRevenueUSD, 0);
});

test("an outbound click is never counted as a conversion", () => {
  const result = aggregateFunnel([
    production("outbound_affiliate_click", { customId: "tiktok-price-hirono-0817" }),
  ]);
  assert.equal(result.outboundClicks, 1);
  assert.equal(result.providerConfirmedConversions, 0);
  assert.equal(result.confirmedRevenueUSD, 0);
  assert.equal(result.rates.confirmedConversionsPerClickPct, 0);
});

test("revenue requires provider-confirmed evidence with a stable evidence id", () => {
  const result = aggregateFunnel([
    production("provider_conversion", { confirmedRevenueUSD: 88, provider: "ebay_epn" }),
    production("provider_conversion", { status: "rejected", providerEvidenceId: "reject-1", provider: "ebay_epn", confirmedRevenueUSD: 99 }),
    production("provider_conversion", { status: "provider_confirmed", providerEvidenceId: "real-1", provider: "ebay_epn", customId: "campaign-1", confirmedRevenueUSD: 12.34 }),
  ]);
  assert.equal(result.providerConfirmedConversions, 1);
  assert.equal(result.confirmedRevenueUSD, 12.34);
});

test("provider evidence is deduplicated by provider and stable evidence id", () => {
  const event = production("provider_conversion", { status: "provider_confirmed", providerEvidenceId: "txn-123", provider: "ebay_epn", customId: "campaign-1", confirmedRevenueUSD: 4.5 });
  const result = aggregateFunnel([event, { ...event, confirmedRevenueUSD: 500 }]);
  assert.equal(result.providerConfirmedConversions, 1);
  assert.equal(result.confirmedRevenueUSD, 4.5);
});

test("source, campaign, series, and figure breakdowns use observed production events", () => {
  const result = aggregateFunnel([
    production("page_view", { source: "tiktok", campaign: "hirono-video-1" }),
    production("landing_session_source", { source: "tiktok", campaign: "hirono-video-1" }),
    production("agent_question", { seriesSlug: "hirono-mist-walker" }),
    production("outbound_affiliate_click", { seriesSlug: "hirono-mist-walker", figure: "The Tempered Aegis", placement: "series_table" }),
  ]);
  assert.deepEqual(result.breakdowns.sources[0], { key: "tiktok", count: 2 });
  assert.deepEqual(result.breakdowns.campaigns[0], { key: "hirono-video-1", count: 2 });
  assert.deepEqual(result.breakdowns.clickSeries[0], { key: "hirono-mist-walker", count: 1 });
  assert.deepEqual(result.breakdowns.clickFigures[0], { key: "The Tempered Aegis", count: 1 });
});

test("zero-result rates stay truthful instead of inventing percentages", () => {
  const result = aggregateFunnel([]);
  assert.equal(result.pageViews, 0);
  assert.equal(result.providerConfirmedConversions, 0);
  assert.equal(result.confirmedRevenueUSD, 0);
  assert.equal(result.rates.clicksPerViewPct, null);
  assert.equal(conversionRate(1, 0), null);
});

test("dashboard date ranges are clamped to 1 through 30 days", () => {
  assert.equal(normalizeLookbackDays(1), 1);
  assert.equal(normalizeLookbackDays(7), 7);
  assert.equal(normalizeLookbackDays(365), 30);
  assert.equal(normalizeLookbackDays(0), 1);
});

test("conversion intake is owner-only and requires provider evidence fields", () => {
  const source = fs.readFileSync(new URL("../app/api/owner/conversions/route.js", import.meta.url), "utf8");
  assert.match(source, /assertOwnerDashboardCode/);
  assert.match(source, /providerEvidenceId/);
  assert.match(source, /customId/);
  assert.match(source, /confirmedRevenueUSD/);
  assert.match(source, /owner_entered_provider_report/);
  assert.doesNotMatch(source, /estimatedRevenue|estimatedConversion|assumedSale/i);
});

test("public funnel intake cannot submit conversion events", () => {
  const source = fs.readFileSync(new URL("../app/api/funnel/event/route.js", import.meta.url), "utf8");
  assert.match(source, /PUBLIC_EVENTS/);
  assert.doesNotMatch(source.match(/const PUBLIC_EVENTS[\s\S]*?\];/)?.[0] || "", /PROVIDER_CONVERSION|OUTBOUND_AFFILIATE_CLICK/);
});
