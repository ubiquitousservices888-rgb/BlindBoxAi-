import assert from "node:assert/strict";
import test from "node:test";

import { reportingStatus } from "../lib/owner-dashboard.js";
import { money, numberOrStatus } from "../lib/revenue-status.mjs";

test("missing affiliate reporting remains unknown rather than zero", () => {
  const status = reportingStatus();
  assert.equal(status.epn.status, "Reporting not connected");
  assert.equal(status.epn.orders, null);
  assert.equal(status.epn.earnings, null);
  assert.equal(status.epn.epc, null);
  assert.match(status.amazon.status, /amazon report not imported/i);
  assert.equal(status.amazon.orders, null);
  assert.equal(status.amazon.earnings, null);
  assert.equal(status.amazon.epc, null);
});

test("connected Amazon reporting preserves network metrics", () => {
  const status = reportingStatus(null, {
    status: "Connected from Amazon Associates report",
    orders: 3,
    earnings: 4.25,
    epc: 0.85,
    networkClicks: 5,
    importedAt: "2026-09-07T12:00:00.000Z",
    source: "amazon_associates_report",
  });
  assert.equal(status.amazon.orders, 3);
  assert.equal(status.amazon.earnings, 4.25);
  assert.equal(status.amazon.epc, 0.85);
  assert.equal(status.amazon.networkClicks, 5);
});

test("dashboard formatters never render missing reporting as zero", () => {
  assert.equal(money(null), "Not connected");
  assert.equal(money(undefined), "Not connected");
  assert.equal(money(undefined, "Unavailable in this report"), "Unavailable in this report");
  assert.equal(numberOrStatus(null), "Not connected");
  assert.equal(money(0), "$0.00");
  assert.equal(numberOrStatus(0), "0");
});
