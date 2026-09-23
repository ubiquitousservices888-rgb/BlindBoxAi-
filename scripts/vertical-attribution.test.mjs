import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCustomId,
  isValidSource,
  parseAttribution,
  sanitizeSlug,
  verticalFromSource,
} from "../lib/attribution.mjs";
import { buildAmazonSearchUrl, amazonOutboundPath } from "../lib/amazon-associates.mjs";
import { AMAZON_VIDEO_CTA } from "../lib/video-pipeline.mjs";

const ebayRoute = readFileSync("app/api/out/ebay/route.js", "utf8");
const analytics = readFileSync("app/_components/CoreAnalytics.jsx", "utf8");
const amazonRoute = readFileSync("app/api/out/amazon/route.js", "utf8");
const videoPipeline = readFileSync("lib/video-pipeline.mjs", "utf8");
const attribution = readFileSync("lib/attribution.mjs", "utf8");

const CUSTOM_ID_RE = /^[a-z0-9._-]+$/;

test("closed source taxonomy rejects unvalidated vertical-source input", () => {
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

test("valid structured source is authoritative for vertical", () => {
  const parsed = parseAttribution({
    source: "sc_yt_001",
    vertical: "bb",
    itemSlug: "Michael Jordan / 1993",
  });
  assert.equal(parsed.source, "sc_yt_001");
  assert.equal(parsed.vertical, "sc");
  assert.equal(parsed.itemSlug, "michael-jordan-1993");
});

test("eBay route preserves closed vertical attribution while broader landing source is separately recorded", () => {
  assert.match(ebayRoute, /resolveRequestAttribution/);
  assert.match(ebayRoute, /buildCustomId\(attribution\)/);
  assert.match(ebayRoute, /epnCustomId\(/);
  assert.match(ebayRoute, /vertical:\s*attribution\.vertical/);
  assert.match(ebayRoute, /source:\s*hasMarketingSource \|\| campaignId \? outboundSource : attribution\.source/);
  assert.match(ebayRoute, /campaignSource:\s*campaignId \? outboundSource : null/);
  assert.match(ebayRoute, /itemSlug:\s*attribution\.itemSlug/);
});

test("inbound attribution remains session-only and stores no cookie", () => {
  assert.match(analytics, /sessionStorage\.getItem\(ATTRIBUTION_STORAGE_KEY\)/);
  assert.match(analytics, /sessionStorage\.setItem\(ATTRIBUTION_STORAGE_KEY, candidate\)/);
  assert.match(analytics, /sessionStorage\.getItem\(LANDING_SOURCE_STORAGE_KEY\)/);
  assert.match(analytics, /sessionStorage\.setItem\(LANDING_SOURCE_STORAGE_KEY, incoming\)/);
  assert.match(analytics, /isValidSource\(candidate\)/);
  assert.doesNotMatch(analytics, /document\.cookie/);
});

test("eBay attribution preserves native new-tab and modified-click behavior", () => {
  assert.match(analytics, /target\.pathname !== "\/api\/out\/ebay" && target\.pathname !== "\/api\/out\/ebay-live"/);
  assert.match(analytics, /anchor\.setAttribute\("href", decoratedHref\)/);
  assert.match(analytics, /String\(anchor\.target \|\| ""\)\.toLowerCase\(\) === "_blank"/);
  assert.match(analytics, /event\.metaKey/);
  assert.match(analytics, /event\.ctrlKey/);
  assert.match(analytics, /event\.shiftKey/);
  assert.match(analytics, /if \(preserveNativeNavigation\) return;/);
  assert.match(analytics, /event\.preventDefault\(\);\s*window\.location\.assign\(decoratedHref\)/s);
});

test("Amazon shop remains direct while video CTA lands on BlindBoxAI", () => {
  const url = buildAmazonSearchUrl("acrylic-display-case");
  assert.equal(new URL(url).searchParams.get("tag"), "blindboxai-20");
  assert.equal(AMAZON_VIDEO_CTA, "https://blindboxai.com/shop/accessories");
  assert.doesNotMatch(AMAZON_VIDEO_CTA, /\/api\/out\/amazon|amazon\.com/i);
  assert.doesNotMatch(videoPipeline, /amazonOutboundPath/);
  assert.match(videoPipeline, /amazon_cta:/);
  assert.doesNotMatch(amazonRoute, /\/api\/out\/amazon.*amazonOutboundPath/);
  assert.match(amazonRoute, /buildAmazonSearchUrl\(offer\.id\)/);
  assert.match(amazonOutboundPath("acrylic-display-case"), /^\/api\/out\/amazon\?/);
});

test("attribution grammar is centralized", () => {
  assert.match(attribution, /export function buildCustomId/);
  assert.match(attribution, /const MAX_CUSTOM_ID = 64/);
  assert.match(attribution, /escapeRegexToken/);
  assert.match(attribution, /VERTICALS\.map\(escapeRegexToken\)/);
  assert.match(attribution, /PLATFORMS\.map\(escapeRegexToken\)/);
  assert.match(attribution, /sourceMatch\(source\)\?\.\[1\]/);
  assert.doesNotMatch(attribution, /slice\(0,\s*2\)/);
});
