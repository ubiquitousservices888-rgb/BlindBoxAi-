import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateFunnel,
  confirmedRevenue,
  conversionRate,
  EVENT_STATUS,
  FUNNEL_EVENTS,
  MAX_CONFIRMED_REVENUE_USD,
  stableEvidenceKey,
} from "../lib/funnel-events.mjs";

function production(event, extra = {}) {
  return {
    namespace: "production",
    test: false,
    status: EVENT_STATUS.OBSERVED,
    event,
    ...extra,
  };
}

function conversion(extra = {}) {
  return production(FUNNEL_EVENTS.PROVIDER_CONVERSION, {
    status: EVENT_STATUS.PROVIDER_CONFIRMED,
    provider: "ebay_epn",
    providerEvidenceId: "txn-1",
    confirmedRevenueUSD: 4.5,
    ...extra,
  });
}

test("test, demo, and unmarked events never enter production KPIs", () => {
  const result = aggregateFunnel([
    production(FUNNEL_EVENTS.PAGE_VIEW),
    { namespace: "test", test: true, event: FUNNEL_EVENTS.PAGE_VIEW, status: EVENT_STATUS.OBSERVED },
    { namespace: "demo", test: false, event: FUNNEL_EVENTS.PAGE_VIEW, status: EVENT_STATUS.OBSERVED },
    { namespace: "production", event: FUNNEL_EVENTS.PAGE_VIEW, status: EVENT_STATUS.OBSERVED },
    { ...conversion(), test: true, confirmedRevenueUSD: 9999 },
  ]);

  assert.equal(result.pageViews, 1);
  assert.equal(result.providerConfirmedConversions, 0);
  assert.equal(result.confirmedRevenueUSD, 0);
});

test("an outbound click is never counted as a conversion", () => {
  const result = aggregateFunnel([
    production(FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK, { customId: "tiktok-price-hirono" }),
  ]);

  assert.equal(result.outboundClicks, 1);
  assert.equal(result.providerConfirmedConversions, 0);
  assert.equal(result.confirmedRevenueUSD, 0);
  assert.equal(result.rates.confirmedConversionsPerClickPct, 0);
  assert.equal(result.zeroState, "No verified conversions yet");
});

test("only provider-confirmed signups enter the confirmed-signup KPI", () => {
  const result = aggregateFunnel([
    production(FUNNEL_EVENTS.WAITLIST_SIGNUP),
    production(FUNNEL_EVENTS.WAITLIST_SIGNUP, { providerConfirmed: false }),
    production(FUNNEL_EVENTS.WAITLIST_SIGNUP, { providerConfirmed: true }),
  ]);

  assert.equal(result.confirmedSignups, 1);
});

test("conversion and revenue require valid provider evidence", () => {
  const result = aggregateFunnel([
    conversion({ provider: "" }),
    conversion({ providerEvidenceId: "" }),
    conversion({ status: "confirmed-ish" }),
    conversion({ status: EVENT_STATUS.REJECTED, providerEvidenceId: "rejected-1", confirmedRevenueUSD: 99 }),
    conversion({ providerEvidenceId: "real-1", confirmedRevenueUSD: "12.34" }),
  ]);

  assert.equal(result.providerConfirmedConversions, 1);
  assert.equal(result.rejectedEvidence, 1);
  assert.equal(result.confirmedRevenueUSD, 12.34);
  assert.equal(result.zeroState, null);
});

test("provider evidence uses an unambiguous tuple key", () => {
  const first = conversion({ provider: "a:b", providerEvidenceId: "c", confirmedRevenueUSD: 1 });
  const second = conversion({ provider: "a", providerEvidenceId: "b:c", confirmedRevenueUSD: 2 });
  assert.notEqual(stableEvidenceKey(first), stableEvidenceKey(second));

  const result = aggregateFunnel([first, second, { ...first, confirmedRevenueUSD: 100 }]);
  assert.equal(result.providerConfirmedConversions, 2);
  assert.equal(result.confirmedRevenueUSD, 3);
});

test("malformed and extreme revenue cannot make totals non-finite", () => {
  assert.equal(confirmedRevenue(conversion({ confirmedRevenueUSD: "" })), 0);
  assert.equal(confirmedRevenue(conversion({ confirmedRevenueUSD: null })), 0);
  assert.equal(confirmedRevenue(conversion({ confirmedRevenueUSD: "0x10" })), 0);
  assert.equal(confirmedRevenue(conversion({ confirmedRevenueUSD: "10.075" })), 0);
  assert.equal(confirmedRevenue(conversion({ confirmedRevenueUSD: Infinity })), 0);
  assert.equal(
    confirmedRevenue(conversion({ confirmedRevenueUSD: MAX_CONFIRMED_REVENUE_USD + 1 })),
    0,
  );

  const result = aggregateFunnel([
    conversion({ providerEvidenceId: "bad-1", confirmedRevenueUSD: Infinity }),
    conversion({ providerEvidenceId: "bad-2", confirmedRevenueUSD: Number.MAX_VALUE }),
  ]);
  assert.equal(result.providerConfirmedConversions, 2);
  assert.equal(result.confirmedRevenueUSD, 0);
  assert.equal(result.invalidRevenueEvidence, 2);
  assert.equal(result.revenueOverflow, false);
  assert.equal(Number.isFinite(result.confirmedRevenueUSD), true);
});

test("revenue overflow is explicit and never silently drops accepted values", () => {
  const result = aggregateFunnel([
    conversion({ providerEvidenceId: "large-1", confirmedRevenueUSD: MAX_CONFIRMED_REVENUE_USD }),
    conversion({ providerEvidenceId: "large-2", confirmedRevenueUSD: MAX_CONFIRMED_REVENUE_USD }),
  ]);

  assert.equal(result.providerConfirmedConversions, 2);
  assert.equal(result.confirmedRevenueUSD, null);
  assert.equal(result.invalidRevenueEvidence, 0);
  assert.equal(result.revenueOverflow, true);
});

test("observed production dimensions produce deterministic breakdowns", () => {
  const result = aggregateFunnel([
    production(FUNNEL_EVENTS.PAGE_VIEW),
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, {
      source: "tiktok",
      campaign: "hirono-video-1",
      contentId: "short-001",
    }),
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, { source: "youtube", campaign: "   " }),
    production(FUNNEL_EVENTS.AGENT_QUESTION, { seriesSlug: "hirono-mist-walker" }),
    production(FUNNEL_EVENTS.OUTBOUND_AFFILIATE_CLICK, {
      seriesSlug: "hirono-mist-walker",
      figure: "The Tempered Aegis",
      placement: "series_table",
      customId: "tiktok-price-hirono",
    }),
  ]);

  assert.deepEqual(result.breakdowns.sources[0], { key: "tiktok", count: 1 });
  assert.deepEqual(result.breakdowns.campaigns[0], { key: "hirono-video-1", count: 1 });
  assert.equal(result.breakdowns.campaigns.length, 1);
  assert.deepEqual(result.breakdowns.contentIds[0], { key: "short-001", count: 1 });
  assert.deepEqual(result.breakdowns.clickSeries[0], { key: "hirono-mist-walker", count: 1 });
  assert.deepEqual(result.breakdowns.clickFigures[0], { key: "The Tempered Aegis", count: 1 });
  assert.deepEqual(result.breakdowns.clickPlacements[0], { key: "series_table", count: 1 });
  assert.deepEqual(result.breakdowns.clickCustomIds[0], { key: "tiktok-price-hirono", count: 1 });
  assert.deepEqual(result.breakdowns.questionsBySeries[0], { key: "hirono-mist-walker", count: 1 });
});

test("long dimensions remain distinct and ties use canonical code-unit order", () => {
  const shared = "x".repeat(300);
  const result = aggregateFunnel([
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, { source: `${shared}a` }),
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, { source: `${shared}b` }),
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, { source: "ä" }),
    production(FUNNEL_EVENTS.LANDING_SESSION_SOURCE, { source: "z" }),
  ]);

  assert.equal(result.breakdowns.sources.length, 4);
  assert.deepEqual(result.breakdowns.sources.map((item) => item.key), [
    `${shared}a`,
    `${shared}b`,
    "z",
    "ä",
  ]);
});

test("rates fail closed when their inputs are not observed and valid", () => {
  assert.equal(conversionRate(1, 0), null);
  assert.equal(conversionRate(-1, 10), null);
  assert.equal(conversionRate(1, Number.NaN), null);
  assert.equal(conversionRate(Number.MAX_VALUE, Number.MIN_VALUE), null);
  assert.equal(aggregateFunnel([]).rates.clicksPerViewPct, null);
});

test("date ranges include exact boundaries and exclude events outside the window", () => {
  const result = aggregateFunnel(
    [
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-19T23:59:59.999Z" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-20T00:00:00.000Z" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-20T12:00:00.000Z" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-21T00:00:00.000Z" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-21T00:00:00.001Z" }),
    ],
    {
      from: "2026-08-20T00:00:00.000Z",
      through: "2026-08-21T00:00:00.000Z",
    },
  );

  assert.equal(result.pageViews, 3);
  assert.deepEqual(result.dateRange, {
    from: "2026-08-20T00:00:00.000Z",
    through: "2026-08-21T00:00:00.000Z",
  });
});

test("active date ranges fail closed for missing and malformed event timestamps", () => {
  const result = aggregateFunnel(
    [
      production(FUNNEL_EVENTS.PAGE_VIEW),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-02-30T00:00:00.000Z" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-20T12:00:00" }),
      production(FUNNEL_EVENTS.PAGE_VIEW, { occurredAt: "2026-08-20T12:00:00.000Z" }),
    ],
    {
      from: "2026-08-20T00:00:00.000Z",
      through: "2026-08-20T23:59:59.999Z",
    },
  );

  assert.equal(result.pageViews, 1);
  assert.equal(result.excludedInvalidTimestampEvents, 3);
});

test("date windows normalize timezone offsets and filter conversions before dedupe", () => {
  const result = aggregateFunnel(
    [
      conversion({
        providerEvidenceId: "shared",
        occurredAt: "2026-08-20T05:59:59.999Z",
        confirmedRevenueUSD: 999,
      }),
      conversion({
        providerEvidenceId: "shared",
        occurredAt: "2026-08-20T01:00:00.000-05:00",
        confirmedRevenueUSD: 12.34,
      }),
    ],
    {
      from: "2026-08-20T01:00:00.000-05:00",
      through: "2026-08-20T02:00:00.000-05:00",
    },
  );

  assert.equal(result.providerConfirmedConversions, 1);
  assert.equal(result.confirmedRevenueUSD, 12.34);
  assert.deepEqual(result.dateRange, {
    from: "2026-08-20T06:00:00.000Z",
    through: "2026-08-20T07:00:00.000Z",
  });
});

test("invalid or partial date ranges are rejected instead of returning misleading totals", () => {
  assert.throws(
    () => aggregateFunnel([], { from: "2026-08-20T00:00:00.000Z" }),
    /both from and through/,
  );
  assert.throws(
    () => aggregateFunnel([], {
      from: "2026-08-21T00:00:00.000Z",
      through: "2026-08-20T00:00:00.000Z",
    }),
    /must not exceed/,
  );
  assert.throws(
    () => aggregateFunnel([], {
      from: "08/20/2026",
      through: "2026-08-21T00:00:00.000Z",
    }),
    /valid ISO 8601/,
  );
});
