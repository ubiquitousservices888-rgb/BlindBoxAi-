import assert from "node:assert/strict";
import test from "node:test";
import { parseEpnReportCsv } from "../lib/epn-reporting.mjs";
import { reportingStatus } from "../lib/owner-dashboard.js";

test("Performance by Day report produces orders earnings and EPC", () => {
  const csv = [
    "Day,Clicks,Transactions,Earnings",
    "2026-09-01,10,2,$4.50",
    "2026-09-02,5,1,$1.50",
  ].join("\n");
  const report = parseEpnReportCsv(csv, { now: new Date("2026-09-04T12:00:00Z") });
  assert.equal(report.orders, 3);
  assert.equal(report.earnings, 6);
  assert.equal(report.networkClicks, 15);
  assert.equal(report.epc, 0.4);
  assert.equal(report.status, "Connected from EPN report");
});

test("Transaction Detail counts approved unique transactions and excludes reversed rows", () => {
  const csv = [
    "Status,Partner Network Transaction ID,Earnings,Item",
    'Approved,abc,"$2.25","Figure, blue"',
    "Approved,abc,$1.00,Accessory",
    "Approved,def,$3.00,Plush",
    "Reversed,ghi,-$5.00,Returned",
  ].join("\n");
  const report = parseEpnReportCsv(csv);
  assert.equal(report.orders, 2);
  assert.equal(report.earnings, 6.25);
  assert.equal(report.epc, null);
  assert.match(report.status, /some metrics unavailable/);
});

test("missing earnings column fails closed", () => {
  assert.throws(() => parseEpnReportCsv("Day,Clicks\n2026-09-01,10"), /Earnings or Commission/);
});

test("dashboard preserves unknown values before first EPN import", () => {
  const revenue = reportingStatus();
  assert.equal(revenue.epn.status, "Reporting not connected");
  assert.equal(revenue.epn.orders, null);
  assert.equal(revenue.epn.earnings, null);
  assert.equal(revenue.epn.epc, null);
});

test("dashboard exposes only summarized imported EPN metrics", () => {
  const revenue = reportingStatus({
    status: "Connected from EPN report",
    orders: 4,
    earnings: 12.5,
    epc: 0.25,
    networkClicks: 50,
    importedAt: "2026-09-04T12:00:00.000Z",
    source: "ebay_partner_network_csv",
  });
  assert.deepEqual(revenue.epn, {
    status: "Connected from EPN report",
    orders: 4,
    earnings: 12.5,
    epc: 0.25,
    networkClicks: 50,
    importedAt: "2026-09-04T12:00:00.000Z",
    source: "ebay_partner_network_csv",
  });
});


test("long metadata preambles and ISO currency labels are tolerated", () => {
  const metadata = Array.from({ length: 15 }, (_, index) => `Report metadata ${index + 1}`);
  const csv = [
    ...metadata,
    "Day,Clicks,Transactions,Earnings",
    "2026-09-01,10,2,USD 4.50",
    "2026-09-02,5,1,(1.50 USD)",
  ].join("\n");

  const report = parseEpnReportCsv(csv);
  assert.equal(report.orders, 3);
  assert.equal(report.earnings, 3);
  assert.equal(report.networkClicks, 15);
  assert.equal(report.epc, 0.2);
});
