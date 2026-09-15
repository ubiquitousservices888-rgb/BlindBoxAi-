import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCampaignId,
  campaignCustomIdSuffix,
  normalizeCampaignId,
  normalizeSource,
} from "../lib/campaign-attribution.mjs";

import { epnCustomId, ebayOutboundPath } from "../lib/data.js";

const attributionBridge = readFileSync(new URL("../app/_components/CampaignAttributionBridge.jsx", import.meta.url), "utf8");
const ebayRoute = readFileSync(new URL("../app/api/out/ebay/route.js", import.meta.url), "utf8");
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

test("source is normalized without carrying arbitrary text", () => {
  assert.equal(normalizeSource("YouTube Shorts"), "youtubeshorts");
  assert.equal(normalizeSource(""), "page");
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

test("outbound path keeps first-party attribution", () => {
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

test("empty campaign preserves legacy link shape", () => {
  const suffix = campaignCustomIdSuffix({ campaignId: "", source: "youtube" });
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

test("campaign-attributed series clicks carry the same identifier into eBay EPN customid", () => {
  assert.match(ebayRoute, /epnCustomId/);
  assert.match(ebayRoute, /const customId = campaignId[\s\S]*?epnCustomId\(/);
  assert.match(ebayRoute, /campaignId,/);
  assert.match(ebayRoute, /campaignSource:\s*campaignId \? outboundSource : null/);
  assert.match(ebayRoute, /source:\s*attribution\.source/);
});
