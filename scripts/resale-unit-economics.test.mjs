import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("alpha acquisition pages are publicly discoverable and first-party", () => {
  const sitemap = read("app/sitemap.js");
  const landing = read("app/tools/resale-margin/page.jsx");
  const home = read("app/page.jsx");
  assert.match(sitemap, /\$\{SITE\}\/tools\/resale-margin/);
  assert.match(sitemap, /\$\{SITE\}\/pro/);
  assert.match(landing, /join the free reseller alpha list/);
  assert.match(home, /utm_campaign=alpha_launch_202610/);
  assert.doesNotMatch(landing, /ebay\.com\/itm\//);
});
import { calculateResaleMargin } from "../lib/resale-unit-economics.mjs";

test("fees and both shipping legs affect real resale margin", () => {
  const r = calculateResaleMargin({ purchase: 20, inboundShipping: 4, salesTax: 2, salePrice: 50, feePercent: 10, outboundShipping: 4 });
  assert.equal(r.valid, true);
  assert.equal(r.netProfit, 15);
  assert.equal(r.sellingFee, 5);
  assert.equal(r.maxPurchasePrice, 35);
  assert.ok(Math.abs(r.breakEvenSalePrice - 33.333333333333336) < 0.00001);
});
test("purchase ceiling respects desired profit and rejects unattainable targets", () => {
  const possible = calculateResaleMargin({ purchase: 20, inboundShipping: 4, salesTax: 2, salePrice: 50, feePercent: 10, outboundShipping: 4, desiredProfit: 10 });
  assert.equal(possible.valid, true);
  assert.equal(possible.maxPurchasePrice, 25);
  const impossible = calculateResaleMargin({ salePrice: 5, outboundShipping: 10, desiredProfit: 2 });
  assert.ok(impossible.maxPurchasePrice < 0);
});

test("loss is displayed as a loss rather than a profit", () => {
  const r = calculateResaleMargin({ purchase: 35, salePrice: 30, feePercent: 10, outboundShipping: 5 });
  assert.equal(r.valid, true);
  assert.equal(r.netProfit, -13);
});
test("rejects invalid and negative inputs and fee rates of 100 percent", () => {
  for (const bad of [{ purchase: -1 }, { salePrice: "not-a-number" }, { feePercent: 100 }, { feePercent: "Infinity" }, { desiredProfit: -5 }]) {
    assert.equal(calculateResaleMargin(bad).valid, false);
  }
});
test("zero cost scenario and optional blank values are handled", () => {
  const r = calculateResaleMargin({ purchase: "", salePrice: "0", feePercent: "" });
  assert.deepEqual({ profit: r.netProfit, breakEven: r.breakEvenSalePrice }, { profit: 0, breakEven: 0 });
});
