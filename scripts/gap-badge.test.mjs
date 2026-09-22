import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { askingVsSoldGapPct } from "../lib/price-page-core.mjs";

const component = fs.readFileSync(new URL("../app/_components/AskingSoldGapBadge.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/price/[itemSlug]/page.jsx", import.meta.url), "utf8");

test("gap badge uses shared verified math and explicit no-data state", () => {
  assert.equal(askingVsSoldGapPct(225, 150), 50);
  assert.equal(askingVsSoldGapPct(null, 150), null);
  assert.match(component, /Asking vs sold: no data/);
  assert.match(component, /verified-math/);
});

test("verified item page uses the reusable gap badge", () => {
  assert.match(page, /AskingSoldGapBadge/);
  assert.doesNotMatch(page, /gap === null/);
});
