import assert from "node:assert/strict";
import test from "node:test";
import { epnTdrDateRange, epnTdrUrl, fetchEpnTdrCsv, inspectEpnTdr } from "../lib/epn-tdr-api.mjs";
import { parseEpnReportCsv } from "../lib/epn-reporting.mjs";

const csv = [
  "EventDate,UpdateDate,EventName,CustomId,Earnings,EpnTransactionId,Status",
  "2026-10-11,2026-10-12,Sale,bb-rv-0123456789abcdef,2.75,tx-good,approved",
  "2026-10-11,2026-10-12,Sale,bb-rv-0123456789abcdef,4.00,tx-pending,pending",
  "2026-10-11,2026-10-13,Sale,not-ours,25.00,tx-foreign,approved",
].join("\n");

const input = {
  accountSid: "exampleSID123",
  authToken: "fake-secret-only-in-test",
  startDate: "2026-10-01",
  endDate: "2026-10-29",
};

test("EPN TDR official date range is bounded by UTC dates", () => {
  assert.deepEqual(epnTdrDateRange(new Date("2026-10-29T23:00:00Z")), { startDate: "2026-09-24", endDate: "2026-10-29" });
  assert.throws(() => epnTdrDateRange(new Date(), 41), /date window/);
  assert.throws(() => epnTdrUrl({ ...input, startDate: "2026-02-30" }), /date range/);
  assert.throws(() => epnTdrUrl({ ...input, startDate: "2026-08-01" }), /date range/);
  assert.throws(() => epnTdrUrl({ ...input, accountSid: "bad@host" }), /Account SID/);
});

test("EPN TDR fetch uses official static host, HTTP Basic header and update-date all-status filters", async () => {
  const output = await fetchEpnTdrCsv({
    ...input,
    fetchImpl: async (uri, init) => {
      const url = new URL(uri);
      assert.equal(url.origin, "https://api.partner.ebay.com");
      assert.equal(url.pathname, "/Mediapartners/exampleSID123/Reports/ebay_partner_transaction_detail.csv");
      assert.equal(url.searchParams.get("DATE_TYPE"), "update_date");
      assert.equal(url.searchParams.get("STATUS"), "ALL");
      assert.equal(url.searchParams.get("START_DATE"), input.startDate);
      assert.equal(url.searchParams.get("END_DATE"), input.endDate);
      assert.equal(url.searchParams.get("CAMPAIGN_SOLR"), "0");
      assert.equal(url.username, "");
      assert.equal(url.password, "");
      assert.doesNotMatch(uri, /fake-secret|exampleSID123:/);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, `Basic ${Buffer.from("exampleSID123:fake-secret-only-in-test").toString("base64")}`);
      return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
    },
  });
  assert.equal(output, csv);
});

test("EPN official compact headings retain verified attribution and exclude pending/foreign", () => {
  const result = parseEpnReportCsv(csv);
  assert.equal(result.reportType, "transaction_detail");
  assert.equal(result.earnings, 2.75);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].providerEvidenceId, "tx-good");
  assert.equal(result.buckets.pending.rows, 1);
  assert.equal(result.buckets.unmatched_confirmed.rows, 1);
});

test("read-only EPN API diagnostic computes qualifying totals without persisting provider evidence", async () => {
  let reads = 0;
  const summary = await inspectEpnTdr({
    accountSid: input.accountSid,
    authToken: input.authToken,
    now: new Date("2026-10-29T16:00:00Z"),
    fetchImpl: async () => { reads++; return new Response(csv, { headers: { "content-type": "text/csv" } }); },
  });
  assert.equal(reads, 1);
  assert.equal(summary.matchedApprovedTransactions, 1);
  assert.equal(summary.matchedApprovedEarningsUSD, 2.75);
  assert.equal(summary.persisted, false);
  assert.equal(summary.verifiedProviderPayout, false);
  assert.equal(summary.pendingRows, 1);
  assert.equal(summary.reconciliationRequired, false);
});

test("reversal to an approved transaction blocks it rather than double counting", async () => {
  const adjusted = [
    "EventDate,UpdateDate,CustomId,Earnings,EpnTransactionId,Status",
    "2026-10-11,2026-10-11,bb-rv-0123456789abcdef,4.00,tx-a,approved",
    "2026-10-11,2026-10-12,bb-rv-0123456789abcdef,-4.00,tx-a,reversed",
  ].join("\n");
  const summary = await inspectEpnTdr({
    accountSid: input.accountSid, authToken: input.authToken,
    now: new Date("2026-10-29T16:00:00Z"),
    fetchImpl: async () => new Response(adjusted, { headers: { "content-type": "text/csv" } }),
  });
  assert.equal(summary.matchedApprovedTransactions, 0);
  assert.equal(summary.matchedApprovedEarningsUSD, 0);
  assert.equal(summary.reconciliationRequired, true);
});

test("missing credentials, HTML, HTTP errors and redirect responses never import evidence", async () => {
  await assert.rejects(fetchEpnTdrCsv({ ...input, authToken: "" }), /credentials/);
  await assert.rejects(fetchEpnTdrCsv({ ...input, fetchImpl: async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }) }), /CSV/);
  await assert.rejects(fetchEpnTdrCsv({ ...input, fetchImpl: async () => new Response("unauthorized sensitive info", { status: 401, headers: { "content-type": "text/csv" } }) }), /not a direct successful/);
  await assert.rejects(fetchEpnTdrCsv({ ...input, fetchImpl: async () => ({ status: 200, redirected: true, headers: new Headers({ "content-type": "text/csv" }) }) }), /not a direct successful/);
});

test("large EPN API responses fail closed without exposing raw data", async () => {
  await assert.rejects(fetchEpnTdrCsv({
    ...input,
    fetchImpl: async () => new Response("private", { headers: { "content-type": "text/csv", "content-length": "6000000" } }),
  }), /exceeded the limit/);
  await assert.rejects(fetchEpnTdrCsv({
    ...input,
    fetchImpl: async () => new Response(csv, { headers: { "content-type": "text/csv", "content-length": "oops" } }),
  }), /exceeded the limit/);
});


test("owner TDR endpoint is owner-authenticated, server-only and non-mutating", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/owner/epn-tdr/route.js", import.meta.url), "utf8");
  assert.match(route, /assertOwnerCode\(ownerCode\)/);
  assert.match(route, /EPN_REPORTING_CURRENCY/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /private, no-store/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|recordProviderEvidence|\bput\(/);
});
