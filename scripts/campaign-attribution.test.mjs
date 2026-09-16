import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCampaignId,
  campaignCustomIdSuffix,
  normalizeAttributionSource,
  normalizeCampaignId,
  normalizeSource,
  resolveRequestAttribution,
} from "../lib/campaign-attribution.mjs";

import { epnCustomId, ebayOutboundPath } from "../lib/data.js";

const attributionBridge = readFileSync(new URL("../app/_components/CampaignAttributionBridge.jsx", import.meta.url), "utf8");
const coreAnalytics = readFileSync(new URL("../app/_components/CoreAnalytics.jsx", import.meta.url), "utf8");
const ebayRoute = readFileSync(new URL("../app/api/out/ebay/route.js", import.meta.url), "utf8");
const ebayLiveRoute = readFileSync(new URL("../app/api/out/ebay-live/route.js", import.meta.url), "utf8");
const offerRoute = readFileSync(new URL("../app/api/out/offer/route.js", import.meta.url), "utf8");
const amazonRoute = readFileSync(new URL("../app/api/out/amazon/route.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../app/template.jsx", import.meta.url), "utf8");

test("campaign ids reject unsafe input", () => {
  assert.equal(normalizeCampaignId("HIRONO-20260816-A"), "hirono-20260816-a");
  assert.equal(normalizeCampaignId("bad campaign?"), "");
});

test("deterministic campaign builder follows platform-content-series-date scheme", () => {
  assert.equal(
    buildCampaignId({
      platform: "TikTok",
      contentType: "price",
      seriesSlug: "hirono",
      date: new Date("2026-07-31T12:00:00Z"),
    }),
    "tiktok-price-hirono-0731",
  );
});

test("source normalization distinguishes legacy page fallback from clean missing attribution", () => {
  assert.equal(normalizeSource("YouTube Shorts"), "youtubeshorts");
  assert.equal(normalizeSource(""), "page");
  assert.equal(normalizeAttributionSource("Reddit Ads"), "redditads");
  assert.equal(normalizeAttributionSource(""), "none");
});

test("request attribution accepts a source without inventing a campaign", () => {
  assert.deepEqual(
    resolveRequestAttribution({ source: "test" }),
    { campaignId: "", source: "test", recoveredFrom: "query_source" },
  );
});

test("request attribution can recover BlindBoxAI landing tags from referrer", () => {
  assert.deepEqual(
    resolveRequestAttribution({ referer: "https://blindboxai.com/?utm_source=reddit" }),
    { campaignId: "", source: "reddit", recoveredFrom: "blindbox_referrer" },
  );
});

test("missing or stripped referrer fails cleanly to none", () => {
  assert.deepEqual(
    resolveRequestAttribution({ referer: "" }),
    { campaignId: "", source: "none", recoveredFrom: "none" },
  );
  assert.deepEqual(
    resolveRequestAttribution({ referer: "https://reddit.com/r/popmart" }),
    { campaignId: "", source: "none", recoveredFrom: "none" },
  );
});

test("EPN custom id carries campaign and source", () => {
  const id = epnCustomId({
    seriesSlug: "hirono-series",
    figure: "The Other One",
    kind: "active",
    placement: "series_table",
    campaignId: "hirono-20260816-a",
    source: "youtube",
  });
  assert.match(id, /^bb1/);
  assert.match(id, /cehirono20260816axyoutube/);
  assert.ok(id.length <= 240);
});

test("EPN custom id can carry a source-only landing tag", () => {
  const id = epnCustomId({
    seriesSlug: "hirono-series",
    figure: "The Other One",
    kind: "active",
    placement: "series_table",
    source: "test",
  });
  assert.match(id, /^bb1/);
  assert.match(id, /sxtest/);
  assert.ok(id.length <= 240);
});

test("outbound path keeps explicit campaign attribution", () => {
  const path = ebayOutboundPath(
    "hirono-series",
    "The Other One",
    "active",
    { campaignId: "hirono-20260816-a", source: "youtube" },
  );
  assert.match(path, /campaign=hirono-20260816-a/);
  assert.match(path, /source=youtube/);
  assert.doesNotMatch(path, /ebay\.com/);
});

test("empty campaign and source preserve legacy link shape", () => {
  const suffix = campaignCustomIdSuffix({ campaignId: "", source: "" });
  assert.equal(suffix, "");
  const path = ebayOutboundPath("hirono-series", "The Other One", "sold");
  assert.doesNotMatch(path, /campaign=/);
});

test("campaign attribution survives internal BlindBoxAI navigation without tracking cookies", () => {
  assert.match(template, /<CampaignAttributionBridge\s*\/>/);
  assert.match(attributionBridge, /current\.searchParams\.get\("campaign"\)/);
  assert.match(attributionBridge, /next\.searchParams\.set\("campaign", campaignId\)/);
  assert.match(attributionBridge, /next\.searchParams\.set\("source", source\)/);
  assert.match(attributionBridge, /window\.location\.assign\(attributedHref\)/);
  assert.doesNotMatch(attributionBridge, /document\.cookie|localStorage|sessionStorage/);
});

test("landing source survives same-tab navigation in sessionStorage and decorates affiliate clicks", () => {
  assert.match(coreAnalytics, /LANDING_SOURCE_STORAGE_KEY = "bbai_landing_source_v1"/);
  assert.match(coreAnalytics, /params\.get\("utm_source"\) \|\| params\.get\("source"\)/);
  assert.match(coreAnalytics, /sessionStorage\.setItem\(LANDING_SOURCE_STORAGE_KEY, incoming\)/);
  assert.match(coreAnalytics, /sessionStorage\.getItem\(LANDING_SOURCE_STORAGE_KEY\)/);
  assert.match(coreAnalytics, /target\.searchParams\.set\("source", effectiveSource\)/);
  assert.doesNotMatch(coreAnalytics, /document\.cookie/);
});

test("all four outbound routes use the single request-attribution resolver", () => {
  for (const route of [ebayRoute, ebayLiveRoute, offerRoute, amazonRoute]) {
    assert.match(route, /resolveRequestAttribution/);
    assert.match(route, /referer:\s*request\.headers\.get\("referer"\)/);
  }
  assert.doesNotMatch(ebayLiveRoute, /normalizeCampaignId\(url\.searchParams\.get\("campaign"\)\)/);
});

test("series eBay clicks put recovered source into both Supabase event and EPN customid", () => {
  assert.match(ebayRoute, /const hasMarketingSource = outboundSource !== "none"/);
  assert.match(ebayRoute, /campaignId \|\| hasMarketingSource[\s\S]*?epnCustomId\(/);
  assert.match(ebayRoute, /source:\s*hasMarketingSource \|\| campaignId \? outboundSource : attribution\.source/);
  assert.match(ebayRoute, /metadata:\s*\{ attributionRecoveredFrom: requestAttribution\.recoveredFrom \}/);
});
