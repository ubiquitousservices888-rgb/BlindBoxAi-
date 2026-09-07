import assert from "node:assert/strict";
import test from "node:test";

import { parseAmazonAssociatesReport } from "../lib/amazon-reporting.mjs";

test("Amazon Associates report aggregates clicks, orders, earnings, and daily rows", () => {
  const report = parseAmazonAssociatesReport([
    "Date,Product Link Clicks,Items Ordered,Commission Income",
    "2026-09-05,10,2,$1.25",
    "2026-09-06,8,1,$0.75",
  ].join("\n"), { now: new Date("2026-09-07T12:00:00.000Z") });

  assert.equal(report.networkClicks, 18);
  assert.equal(report.orders, 3);
  assert.equal(report.earnings, 2);
  assert.equal(report.epc, 0.11);
  assert.deepEqual(report.daily.map((row) => row.date), ["2026-09-05", "2026-09-06"]);
  assert.equal(report.daily[0].earnings, 1.25);
});

test("Amazon Associates report accepts tab-delimited downloads", () => {
  const report = parseAmazonAssociatesReport([
    "Date\tClicks\tOrdered Items\tEarnings",
    "2026-09-07\t4\t1\t$0.50",
  ].join("\n"));
  assert.equal(report.networkClicks, 4);
  assert.equal(report.orders, 1);
  assert.equal(report.earnings, 0.5);
});
