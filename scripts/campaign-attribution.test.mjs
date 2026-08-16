import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignCustomIdSuffix,
  normalizeCampaignId,
  normalizeSource,
} from "../lib/campaign-attribution.mjs";

import { epnCustomId, ebayOutboundPath } from "../lib/data.js";

test("campaign ids reject unsafe input", () => {
  assert.equal(normalizeCampaignId("HIRONO-20260816-A"), "hirono-20260816-a");
  assert.equal(normalizeCampaignId("bad campaign?"), "");
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
