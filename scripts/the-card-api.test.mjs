import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { cardApiTitleMatches, fetchCardApiSales, normalizeCardApiSale } from "../lib/the-card-api.mjs";

const identity = { brand: "Topps", series: "2022 Topps Tier One", item: "Jose Abreu autograph", condition: "raw" };
const target = { identity, requiredTitleTerms: ["2022", "Topps", "Tier One", "Jose", "Abreu", "Auto"] };

test("missing API key fails closed without a request", async () => {
  let called = false;
  const result = await fetchCardApiSales({ query: "Jose Abreu", identity }, {
    apiKey: "",
    fetchImpl: async () => { called = true; },
  });
  assert.equal(result.status, "not_configured");
  assert.equal(called, false);
  assert.deepEqual(result.records, []);
});

test("only confirmed completed-sale records are normalized", () => {
  const base = {
    id: "sale-1",
    platform: "eBay",
    listing_type: "best_offer",
    price: 42.5,
    currency: "USD",
    price_confirmed: true,
    sold_at: "2026-09-10T00:00:00Z",
    listing_url: "https://www.ebay.com/itm/123",
    title: "2022 Topps Tier One Jose Abreu Auto /100",
  };
  const normalized = normalizeCardApiSale(base, target);
  assert.equal(normalized.amount, 42.5);
  assert.equal(normalized.trust, "marketplace_completed_sales");
  assert.equal(normalized.listingType, "best_offer");
  assert.equal(normalized.observedAt, base.sold_at);
  assert.equal(normalizeCardApiSale({ ...base, price_confirmed: false }, target), null);
  assert.equal(normalizeCardApiSale({ ...base, listing_url: "http://example.test" }, target), null);
  assert.equal(normalizeCardApiSale({ ...base, title: "2022 Topps Tier One Tim Anderson Auto" }, target), null);
});

test("identity terms use token boundaries", () => {
  assert.equal(cardApiTitleMatches("2022 Topps Tier One Jose Abreu Auto /100", target.requiredTitleTerms), true);
  assert.equal(cardApiTitleMatches("2022 Topps Tier One Jose Abreu Automatic Insert", target.requiredTitleTerms), false);
});

test("API key is sent only as a request header and never returned", async () => {
  const secret = "test-secret-value";
  let capturedUrl;
  let capturedHeaders;
  const result = await fetchCardApiSales({ query: "Jose Abreu", identity }, {
    apiKey: secret,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      return { ok: true, json: async () => ({ data: [] }) };
    },
  });
  assert.equal(capturedUrl.includes(secret), false);
  assert.equal(capturedHeaders["x-market-api-key"], secret);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("sports-card scripts stay review-only and match registered research targets", () => {
  const registry = JSON.parse(fs.readFileSync(new URL("../data/know-it-all/sports-card-research-targets.json", import.meta.url), "utf8"));
  const scripts = JSON.parse(fs.readFileSync(new URL("../data/know-it-all/sports-card-video-scripts.json", import.meta.url), "utf8"));
  const ids = new Set(registry.targets.map((entry) => entry.id));
  assert.equal(scripts.state, "READY_FOR_REVIEW");
  assert.equal(scripts.publishAutomatically, false);
  assert.equal(scripts.publicCta, "https://www.blindboxai.com");
  for (const entry of scripts.scripts) {
    assert.equal(ids.has(entry.researchTargetId), true);
    const publicText = `${entry.replacementTitle}\n${entry.voiceover.join(" ")}\n${entry.caption}`;
    assert.doesNotMatch(publicText, /\b(?:steal|invest(?:ment|or|ing)?|guarantee(?:d|s)? profit|price prediction)\b/i);
    assert.match(entry.caption, /https:\/\/www\.blindboxai\.com/);
    assert.match(entry.caption, /#ad/);
  }
});
