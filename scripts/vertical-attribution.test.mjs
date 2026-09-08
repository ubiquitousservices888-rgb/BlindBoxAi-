import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCustomId,
  isValidSource,
  sanitizeSlug,
  verticalFromSource,
} from "../lib/attribution.mjs";
import { buildAmazonSearchUrl, amazonOutboundPath } from "../lib/amazon-associates.mjs";

const ebayRoute = readFileSync("app/api/out/ebay/route.js", "utf8");
const analytics = readFileSync("app/_components/CoreAnalytics.jsx", "utf8");
const amazonRoute = readFileSync("app/api/out/amazon/route.js", "utf8");
const attribution = readFileSync("lib/attribution.mjs", "utf8");

const CUSTOM_ID_RE = /^[a-z0-9._-]+$/;

test("closed source taxonomy rejects unvalidated input", () => {
  for (const value of ["../../x", "a".repeat(500), "<script>", "sc_yt_1", "garbage", ""]) {
    assert.equal(isValidSource(value), false, value);
  }
  assert.equal(isValidSource("sc_yt_001"), true);
  assert.equal(isValidSource("bb_pin_014"), true);
  assert.equal(verticalFromSource("sc_yt_001"), "sc");
  assert.equal(verticalFromSource("garbage"), null);
});

test("customid is deterministic, bounded, and safe", () => {
  const id = buildCustomId({
    vertical: "sc",
    source: "sc_yt_001",
    itemSlug: "Topps Chrome 1993 / Michael Jordan #1!!",
  });
  assert.match(id, CUSTOM_ID_RE);
  assert.ok(id.length <= 64);
  assert.equal(id, "sc.sc_yt_001.topps-chrome-1993-michael-jordan-1");

  const long = buildCustomId({
    vertical: "sc",
    source: "sc_yt_001",
    itemSlug: "x".repeat(500),
  });
  assert.ok(long.length <= 64);
  assert.match(long, CUSTOM_ID_RE);
  assert.equal(sanitizeSlug("<script> ABC / 123"), "-script-abc-123");
});

test("eBay route uses the single attribution builder and records vertical fields", () => {
  assert.match(ebayRoute, /buildCustomId\(attribution\)/);
  assert.match(ebayRoute, /vertical:\s*attribution\.vertical/);
  assert.match(ebayRoute, /source:\s*attribution\.source/);
  assert.match(ebayRoute, /itemSlug:\s*attribution\.itemSlug/);
  assert.doesNotMatch(ebayRoute, /epnCustomId/);
});

test("inbound source is first-party session storage only", () => {
  assert.match(analytics, /sessionStorage\.getItem\(ATTRIBUTION_STORAGE_KEY\)/);
  assert.match(analytics, /sessionStorage\.setItem\(ATTRIBUTION_STORAGE_KEY, candidate\)/);
  assert.match(analytics, /isValidSource\(candidate\)/);
  assert.doesNotMatch(analytics, /document\.cookie/);
});

test("Amazon remains direct and uses the fixed Associates tag", () => {
  const url = buildAmazonSearchUrl("acrylic-display-case");
  assert.equal(new URL(url).searchParams.get("tag"), "blindboxai-20");
  assert.doesNotMatch(amazonRoute, /\/api\/out\/amazon.*amazonOutboundPath/);
  assert.match(amazonRoute, /buildAmazonSearchUrl\(offer\.id\)/);
  assert.match(amazonOutboundPath("acrylic-display-case"), /^\/api\/out\/amazon\?/);
});

test("attribution grammar is centralized", () => {
  assert.match(attribution, /export function buildCustomId/);
  assert.match(attribution, /const MAX_CUSTOM_ID = 64/);
  assert.match(attribution, /const SRC_RE/);
});
