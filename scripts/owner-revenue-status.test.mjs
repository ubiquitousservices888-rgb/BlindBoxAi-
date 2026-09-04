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
  assert.match(status.amazon.status, /reporting pending Amazon approval/i);
  assert.equal(status.amazon.orders, null);
  assert.equal(status.amazon.earnings, null);
  assert.equal(status.amazon.epc, null);
});

test("dashboard formatters never render missing reporting as zero", () => {
  assert.equal(money(null), "Not connected");
  assert.equal(money(undefined), "Not connected");
  assert.equal(numberOrStatus(null), "Not connected");
  assert.equal(money(0), "$0.00");
  assert.equal(numberOrStatus(0), "0");
});
