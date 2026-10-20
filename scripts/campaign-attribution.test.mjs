import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCampaignId,
  campaignCustomIdSuffix,
  normalizeAttributionSource,
  normalizeCampaignId,
  normalizeSource,
  preserveInternalCampaignLink,
  resolveRequestAttribution,
} from "../lib/campaign-attribution.mjs";

import { epnCustomId, ebayOutboundPath } from "../lib/data.js";

const attributionBridge = readFileSync(new URL("../app/_components/CampaignAttributionBridge.jsx", import.meta.url), "utf8");
const coreAnalytics = readFileSync(new URL("../app/_components/CoreAnalytics.jsx", import.meta.url), "utf8");
const ebayRoute = readFileSync(new URL("../app/api/out/ebay/route.js", import.meta.url), "utf8");
const ebayReadonlyResolver = readFileSync(new URL("../lib/ebay-outbound-readonly.mjs", import.meta.url), "utf8");
const ebayLiveRoute = readFileSync(new URL("../app/api/out/ebay-live/route.js", import.meta.url), "utf8");
const offerRoute = readFileSync(new URL("../app/api/out/offer/route.js", import.meta.url), "utf8");
const amazonRoute = readFileSync(new URL("../app/api/out/amazon/route.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../app/template.jsx", import.meta.url), "utf8");

test("invalid direct campaign falls back to valid UTM, repeated keys reject arrays", () => {
  const query = { campaign: "bad id", utm_campaign: "bb-rv-3c9c9bb78c37ff6a" };
  const campaignId = normalizeCampaignId(query.campaign) || normalizeCampaignId(query.utm_campaign);
  assert.equal(campaignId, "bb-rv-3c9c9bb78c37ff6a");
  const url = new URL(ebayOutboundPath("hirono-mist-walker", "The Wingless Follower", "sold", { campaignId, source: "youtube" }), "https://blindboxai.com");
  assert.equal(url.searchParams.get("campaign"), campaignId);
  const repeated = ["bb-rv-a", "bb-rv-3c9c9bb78c37ff6a"];
  assert.equal(normalizeCampaignId(repeated), "");
  assert.equal(normalizeAttributionSource(repeated), "none");
  assert.equal(normalizeSource(repeated), "page");
  const repeatedUrl = new URL(ebayOutboundPath("hirono-mist-walker", "The Wingless Follower", "sold", { campaignId: normalizeCampaignId(repeated), source: "youtube" }), "https://blindboxai.com");
  assert.equal(repeatedUrl.searchParams.has("campaign"), false);
  const buyPage = readFileSync(new URL("../app/tools/buy-or-pass/[offerId]/page.jsx", import.meta.url), "utf8");
  assert.ok(buyPage.includes("normalizeCampaignId(query?.campaign) || normalizeCampaignId(query?.utm_campaign)"));
  assert.ok(buyPage.includes("query?.source || query?.utm_source || 'buy_or_pass'"));
});

test("series outbound links validate and forward UTM campaign alongside explicit source", () => {
  const seriesPage = readFileSync(new URL("../app/series/[slug]/page.jsx", import.meta.url), "utf8");
  assert.ok(seriesPage.includes("normalizeCampaignId(query?.campaign) || normalizeCampaignId(query?.utm_campaign)"));
  assert.ok(seriesPage.includes("normalizeSource(query?.source || query?.utm_source)"));
  assert.ok(seriesPage.includes("const attribution = { campaignId, source }"));
  assert.ok(seriesPage.includes("ebayOutboundPath(s.slug, f.name, \"sold\", attribution)"));
  const campaign = normalizeCampaignId("bb-rv-3c9c9bb78c37ff6a");
  const tagged = new URL(ebayOutboundPath("hirono-mist-walker", "The Wingless Follower", "sold", { campaignId: campaign, source: normalizeSource("youtube") }), "https://blindboxai.com");
  assert.equal(tagged.searchParams.get("campaign"), campaign);
  assert.equal(tagged.searchParams.get("source"), "youtube");
  assert.match(epnCustomId({ seriesSlug: "hirono-mist-walker", figure: "The Wingless Follower", kind: "sold", placement: "series_table", campaignId: campaign, source: "youtube" }), /cebbrv3c9c9bb78c37ff6axyoutube$/);
  for (const input of ["bad id", ""]) {
    const untagged = new URL(ebayOutboundPath("hirono-mist-walker", "The Wingless Follower", "sold", { campaignId: normalizeCampaignId(input), source: "youtube" }), "https://blindboxai.com");
    assert.equal(untagged.searchParams.has("campaign"), false);
    assert.equal(untagged.searchParams.get("source"), "youtube");
    const untaggedCustomId = epnCustomId({ seriesSlug: "hirono-mist-walker", figure: "The Wingless Follower", kind: "sold", placement: "series_table", campaignId: normalizeCampaignId(input), source: "youtube" });
    assert.equal(untaggedCustomId.includes("cebbrv3c9c9bb78c37ff6axyoutube"), false);
    assert.equal(untaggedCustomId.includes("cebbrv3c9c9bb78c37ff6a"), false);
  }
});

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


test("generic affiliate template source recovers the canonical video campaign from first-party referrer", () => {
  assert.deepEqual(resolveRequestAttribution({
    source: "page",
    referer: "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube",
  }), {
    campaignId: "bb-rv-3c9c9bb78c37ff6a",
    source: "youtube",
    recoveredFrom: "blindbox_referrer",
  });
});

test("UTM landing attribution survives server redirect even without client-side JavaScript", () => {
  assert.deepEqual(resolveRequestAttribution({
    source: "site",
    referer: "https://blindboxai.com/shop/accessories?utm_campaign=bb-rv-3c9c9bb78c37ff6a&utm_source=tiktok",
  }), {
    campaignId: "bb-rv-3c9c9bb78c37ff6a",
    source: "tiktok",
    recoveredFrom: "blindbox_referrer",
  });
});

test("external referral and conflicting first-party campaigns cannot overwrite explicit identifiers", () => {
  const external = resolveRequestAttribution({
    source: "page",
    referer: "https://evilblindboxai.com/series/test?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube",
  });
  assert.deepEqual(external, { campaignId: "", source: "page", recoveredFrom: "query_source" });
  const conflicting = resolveRequestAttribution({
    campaign: "bb-rv-aaaaaaaaaaaaaaaa",
    source: "page",
    referer: "https://blindboxai.com/?campaign=bb-rv-bbbbbbbbbbbbbbbb&source=tiktok",
  });
  assert.deepEqual(conflicting, {
    campaignId: "bb-rv-aaaaaaaaaaaaaaaa", source: "page", recoveredFrom: "query_campaign",
  });
  const sourceMismatch = resolveRequestAttribution({
    source: "youtube",
    referer: "https://blindboxai.com/?campaign=bb-rv-bbbbbbbbbbbbbbbb&source=tiktok",
  });
  assert.deepEqual(sourceMismatch, { campaignId: "", source: "youtube", recoveredFrom: "query_source" });
});

test("untrusted referrer URLs never supply campaign identifiers", () => {
  const campaign = "bb-rv-3c9c9bb78c37ff6a";
  for (const referer of [
    `http://blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https://user@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https://blindboxai.com:8443/?campaign=${campaign}&source=youtube`,
  ]) {
    assert.deepEqual(resolveRequestAttribution({ source: "page", referer }), {
      campaignId: "", source: "page", recoveredFrom: "query_source",
    });
  }
});

test("empty userinfo delimiters cannot contribute first-party attribution", () => {
  const campaign = "bb-rv-3c9c9bb78c37ff6a";
  for (const referer of [
    `https://@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https://:@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https:\\\\@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `  https://@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https://\n@blindboxai.com/?campaign=${campaign}&source=youtube`,
  ]) {
    assert.deepEqual(resolveRequestAttribution({ source: "page", referer }), {
      campaignId: "", source: "page", recoveredFrom: "query_source",
    }, `must reject ${JSON.stringify(referer)}`);
  }
});

test("at signs in first-party query parameters do not block attribution", () => {
  assert.deepEqual(resolveRequestAttribution({
    source: "page",
    referer: "https://blindboxai.com/?campaign=bb-rv-3c9c9bb78c37ff6a&source=tiktok&note=a@b",
  }), {
    campaignId: "bb-rv-3c9c9bb78c37ff6a", source: "tiktok", recoveredFrom: "blindbox_referrer",
  });
});

test("noncanonical HTTPS authority spellings cannot contribute attribution", () => {
  const campaign = "bb-rv-3c9c9bb78c37ff6a";
  for (const referer of [
    `https:@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https:/@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https:///@blindboxai.com/?campaign=${campaign}&source=youtube`,
    `https://blindboxai%2Ecom/?campaign=${campaign}&source=youtube`,
  ]) {
    assert.deepEqual(resolveRequestAttribution({ source: "page", referer }), {
      campaignId: "", source: "page", recoveredFrom: "query_source",
    }, `must reject ${JSON.stringify(referer)}`);
  }
});

test("canonical HTTPS authority allows case-insensitive host and no path", () => {
  const campaign = "bb-rv-3c9c9bb78c37ff6a";
  for (const referer of [
    `HTTPS://BLINDBOXAI.COM/?campaign=${campaign}&source=tiktok`,
    `https://blindboxai.com?campaign=${campaign}&source=tiktok`,
  ]) {
    assert.deepEqual(resolveRequestAttribution({ source: "page", referer }), {
      campaignId: campaign, source: "tiktok", recoveredFrom: "blindbox_referrer",
    }, `must accept ${JSON.stringify(referer)}`);
  }
});

test("valid UTM aliases survive invalid direct referrer campaign and generic source", () => {
  assert.deepEqual(resolveRequestAttribution({
    source: "page",
    referer: "https://blindboxai.com/?campaign=bad%20campaign&source=page&utm_campaign=bb-rv-3c9c9bb78c37ff6a&utm_source=tiktok",
  }), {
    campaignId: "bb-rv-3c9c9bb78c37ff6a",
    source: "tiktok",
    recoveredFrom: "blindbox_referrer",
  });
});

test("explicit channel-only outbound click cannot inherit a video campaign", () => {
  assert.deepEqual(resolveRequestAttribution({
    source: "youtube",
    referer: "https://blindboxai.com/?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube",
  }), {
    campaignId: "", source: "youtube", recoveredFrom: "query_source",
  });
});

test("recovering only a generic source with explicit campaign reports the referrer", () => {
  assert.deepEqual(resolveRequestAttribution({
    campaign: "bb-rv-3c9c9bb78c37ff6a",
    source: "page",
    referer: "https://blindboxai.com/?campaign=bb-rv-3c9c9bb78c37ff6a&source=tiktok",
  }), {
    campaignId: "bb-rv-3c9c9bb78c37ff6a",
    source: "tiktok",
    recoveredFrom: "blindbox_referrer",
  });
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

test("EPN custom id preserves the full video campaign suffix at maximum metadata length", () => {
  const campaignId = "bb-rv-0123456789abcdef";
  const source = "youtube";
  const expectedSuffix = campaignCustomIdSuffix({ campaignId, source });
  const id = epnCustomId({
    seriesSlug: "series-".repeat(20),
    figure: "very-long-collector-product-name-".repeat(20),
    kind: "active-kind-with-extra-metadata",
    placement: "series-table-placement-with-extra-metadata",
    campaignId,
    source,
  });
  assert.ok(id.length <= 240);
  assert.ok(id.endsWith(expectedSuffix));
  assert.match(id, /^bb1sseriesseries/);
  assert.match(id, /cebbrv0123456789abcdefxyoutube$/);
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

test("outbound path keeps source-only marketing attribution", () => {
  const path = ebayOutboundPath(
    "hirono-series",
    "The Other One",
    "sold",
    { source: "test" },
  );
  assert.match(path, /source=test/);
  assert.doesNotMatch(path, /campaign=/);
});

test("empty campaign and source preserve legacy link shape", () => {
  const suffix = campaignCustomIdSuffix({ campaignId: "", source: "" });
  assert.equal(suffix, "");
  const path = ebayOutboundPath("hirono-series", "The Other One", "sold");
  assert.doesNotMatch(path, /campaign=/);
  assert.doesNotMatch(path, /source=/);
});

test("campaign or source-only attribution survives internal BlindBoxAI navigation without tracking cookies", () => {
  assert.match(template, /<CampaignAttributionBridge\s*\/>/);
  assert.ok(attributionBridge.includes("const attributedHref = preserveInternalCampaignLink(window.location.href, rawHref)"));
  assert.ok(attributionBridge.includes('anchor.setAttribute("href", attributedHref)'));
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

test("all four outbound paths use the single request-attribution resolver", () => {
  assert.match(ebayRoute, /resolveReadonlyEbayOutboundTarget/);
  assert.match(ebayRoute, /referer:\s*request\.headers\.get\("referer"\)/);
  assert.match(ebayReadonlyResolver, /resolveRequestAttribution/);
  assert.match(ebayReadonlyResolver, /referer,/);

  for (const route of [ebayLiveRoute, offerRoute, amazonRoute]) {
    assert.match(route, /resolveRequestAttribution/);
    assert.match(route, /referer:\s*request\.headers\.get\("referer"\)/);
  }
  assert.doesNotMatch(ebayLiveRoute, /normalizeCampaignId\(url\.searchParams\.get\("campaign"\)\)/);
});

test("series eBay clicks put recovered source into both Supabase event and EPN customid", () => {
  assert.match(ebayReadonlyResolver, /const hasMarketingSource = outboundSource !== "none"/);
  assert.match(ebayReadonlyResolver, /campaignId \|\| hasMarketingSource[\s\S]*?epnCustomId\(/);
  assert.match(ebayRoute, /source:\s*hasMarketingSource \|\| campaignId \? outboundSource : attribution\.source/);
  assert.match(ebayRoute, /metadata:\s*\{ attributionRecoveredFrom: requestAttribution\.recoveredFrom \}/);
});

test("Hair Salon social campaign survives source=page affiliate templates", () => {
  const incoming = "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube";
  const targetPath = preserveInternalCampaignLink(incoming,
    "/api/out/ebay?series=labubu-the-monsters-hair-salon&kind=active&source=page");
  const target = new URL(targetPath, incoming);
  assert.equal(target.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(target.searchParams.get("source"), "youtube");
  assert.deepEqual(resolveRequestAttribution({
    campaign: target.searchParams.get("campaign"), source: target.searchParams.get("source"),
  }), { campaignId: "bb-rv-3c9c9bb78c37ff6a", source: "youtube", recoveredFrom: "query_campaign" });
});

test("attribution ignores external links and unrelated explicit campaigns", () => {
  const landing = "https://www.blindboxai.com/?campaign=bb-rv-3c9c9bb78c37ff6a&source=tiktok";
  assert.equal(preserveInternalCampaignLink(landing, "https://www.ebay.com/"), null);
  assert.equal(preserveInternalCampaignLink(landing, "/series/test?campaign=another-campaign&source=reddit"), null);
  const next = new URL(preserveInternalCampaignLink(landing,
    "/series/labubu-the-monsters-hair-salon?source=site"), landing);
  assert.equal(next.searchParams.get("source"), "tiktok");
  assert.equal(next.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(preserveInternalCampaignLink("https://www.blindboxai.com/", "/series/test"), null);
});

test("source-only video navigation retains source with no invented campaign", () => {
  const landing = "https://www.blindboxai.com/?source=youtube";
  const target = new URL(preserveInternalCampaignLink(landing,
    "/series/labubu?source=site"), landing);
  assert.equal(target.searchParams.get("source"), "youtube");
  assert.equal(target.searchParams.has("campaign"), false);
});

test("source-only UTM traffic supersedes only generic source or utm_source templates", () => {
  const landing = "https://www.blindboxai.com/?utm_source=tiktok";
  const target = new URL(preserveInternalCampaignLink(landing,
    "/series/labubu?utm_source=site"), landing);
  assert.equal(target.searchParams.get("source"), "tiktok");
  assert.equal(target.searchParams.has("utm_source"), false);
  const preservedExplicit = new URL(preserveInternalCampaignLink(landing,
    "/series/labubu?source=newsletter"), landing);
  assert.equal(preservedExplicit.searchParams.get("source"), "newsletter");
});

test("UTM campaigns are inherited only when destination has no conflicting marketing campaign", () => {
  const landing = "https://www.blindboxai.com/?utm_campaign=bb-rv-3c9c9bb78c37ff6a&utm_source=youtube";
  const inherited = new URL(preserveInternalCampaignLink(landing,
    "/series/labubu?source=page"), landing);
  assert.equal(inherited.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
  assert.equal(inherited.searchParams.get("source"), "youtube");

  const video = "https://www.blindboxai.com/?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube";
  const differentCampaign = "/tools/resale-margin?utm_source=site&utm_medium=home&utm_campaign=alpha_launch_202610";
  assert.equal(preserveInternalCampaignLink(video, differentCampaign), null);
  const sameCampaign = new URL(preserveInternalCampaignLink(video,
    "/series/labubu?utm_campaign=bb-rv-3c9c9bb78c37ff6a&utm_source=site"), video);
  assert.equal(sameCampaign.searchParams.get("source"), "youtube");
  assert.equal(sameCampaign.searchParams.has("utm_source"), false);
  assert.equal(sameCampaign.searchParams.get("campaign"), "bb-rv-3c9c9bb78c37ff6a");
});
