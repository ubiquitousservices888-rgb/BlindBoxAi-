import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEpnPerformanceByDayUrl,
  epnApiConfigured,
  fetchEpnPerformanceByDay,
  summarizeEpnPerformancePayload,
} from "../lib/epn-reporting-api.mjs";

test("EPN API configuration requires both Account SID and reporting token", () => {
  assert.equal(epnApiConfigured({}), false);
  assert.equal(epnApiConfigured({ EPN_ACCOUNT_SID: "SID" }), false);
  assert.equal(epnApiConfigured({ EPN_REPORTING_ACCESS_TOKEN: "token" }), false);
  assert.equal(epnApiConfigured({ EPN_ACCOUNT_SID: "SID", EPN_REPORTING_ACCESS_TOKEN: "token" }), true);
});

test("Performance by Day URL contains no auth token and uses official report path", () => {
  const url = buildEpnPerformanceByDayUrl({
    accountSid: "example-sid",
    startDate: "2026-08-06",
    endDate: "2026-09-04",
  });
  assert.match(url, /^https:\/\/api\.partner\.ebay\.com\/mediapartners\/example-sid\/reports\/ebay_partner_perf_by_day\.json\?/);
  assert.match(url, /CAMPAIGN_ID=0/);
  assert.match(url, /CHECKOUT_SITE=0/);
  assert.match(url, /START_DATE=2026-08-06/);
  assert.match(url, /END_DATE=2026-09-04/);
  assert.doesNotMatch(url, /token/i);
});

test("EPN API payload aggregates verified clicks, transactions, earnings, and EPC", () => {
  const report = summarizeEpnPerformancePayload({
    Records: [
      { Clicks: "10", Transactions: "2", Earnings: "4.50", EPC: "0.45" },
      { Clicks: "5", Transactions: "1", Earnings: "1.50", EPC: "0.30" },
    ],
  }, {
    now: new Date("2026-09-04T18:00:00Z"),
    startDate: "2026-08-06",
    endDate: "2026-09-04",
  });

  assert.equal(report.source, "ebay_partner_network_api");
  assert.equal(report.status, "Connected to EPN API");
  assert.equal(report.networkClicks, 15);
  assert.equal(report.orders, 3);
  assert.equal(report.earnings, 6);
  assert.equal(report.epc, 0.4);
  assert.deepEqual(report.period, { startDate: "2026-08-06", endDate: "2026-09-04" });
});

test("connected EPN API with no rows produces verified zero metrics", () => {
  const report = summarizeEpnPerformancePayload({ Records: [] }, { now: new Date("2026-09-04T18:00:00Z") });
  assert.equal(report.networkClicks, 0);
  assert.equal(report.orders, 0);
  assert.equal(report.earnings, 0);
  assert.equal(report.epc, 0);
});

test("EPN API fetch keeps credentials out of URL and sends Basic auth server-side", async () => {
  let capturedUrl = "";
  let capturedAuth = "";
  const report = await fetchEpnPerformanceByDay({
    accountSid: "account-sid",
    authToken: "super-secret-token",
    now: new Date("2026-09-04T18:00:00Z"),
    fetchImpl: async (url, options) => {
      capturedUrl = String(url);
      capturedAuth = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        async json() {
          return { Records: [{ Clicks: "4", Transactions: "1", Earnings: "$2.00" }] };
        },
      };
    },
  });

  assert.doesNotMatch(capturedUrl, /super-secret-token/);
  assert.match(capturedAuth, /^Basic /);
  assert.doesNotMatch(JSON.stringify(report), /super-secret-token/);
  assert.equal(report.orders, 1);
  assert.equal(report.earnings, 2);
  assert.equal(report.epc, 0.5);
});

test("EPN API errors expose status but never credentials", async () => {
  await assert.rejects(
    () => fetchEpnPerformanceByDay({
      accountSid: "account-sid",
      authToken: "never-print-this",
      now: new Date("2026-09-04T18:00:00Z"),
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /never-print-this/);
      return true;
    },
  );
});
