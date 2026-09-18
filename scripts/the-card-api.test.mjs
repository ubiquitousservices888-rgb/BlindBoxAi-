import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  cardApiExactTargetMatches,
  cardApiTitleMatches,
  fetchCardApiSales,
  normalizeCardApiSale,
  summarizeCardApiSales,
} from "../lib/the-card-api.mjs";

const identity = {
  brand: "Topps",
  series: "2022 Topps Tier One",
  item: "Jose Abreu Tier One Talent Autograph TTA-JA /100",
  condition: "raw",
  identifier: "TTA-JA",
};
const target = {
  id: "abreu-test",
  query: "2022 Topps Tier One Jose Abreu TTA-JA autograph",
  identity,
  printRunMax: 100,
  requiredTitleTerms: ["2022", "Topps", "Tier One", "Jose", "Abreu"],
  requiredTitleAliases: [["Auto", "Autograph"]],
};

function sale(overrides = {}) {
  return {
    id: "sale-1",
    platform: "eBay",
    listing_type: "best_offer",
    price: 42.5,
    currency: "USD",
    price_confirmed: true,
    sold_at: "2026-09-10T00:00:00Z",
    listing_url: "https://www.ebay.com/itm/123",
    title: "2022 Topps Tier One Jose Abreu Autograph TTA-JA 25/100",
    ...overrides,
  };
}

test("missing API key fails closed without a request", async () => {
  let called = false;
  const result = await fetchCardApiSales(target, {
    apiKey: "",
    fetchImpl: async () => { called = true; },
  });
  assert.equal(result.status, "not_configured");
  assert.equal(called, false);
  assert.deepEqual(result.records, []);
});

test("only confirmed explicit-USD exact-target completed sales are normalized", () => {
  const normalized = normalizeCardApiSale(sale(), target);
  assert.equal(normalized.amount, 42.5);
  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.trust, "marketplace_completed_sales");
  assert.equal(normalized.listingType, "best_offer");
  assert.equal(normalized.strictTargetMatch, true);
  assert.equal(normalized.observedAt, "2026-09-10T00:00:00Z");
  assert.equal(normalizeCardApiSale(sale({ price_confirmed: false }), target), null);
  assert.equal(normalizeCardApiSale(sale({ currency: "" }), target), null);
  assert.equal(normalizeCardApiSale(sale({ currency: "EUR" }), target), null);
  assert.equal(normalizeCardApiSale(sale({ listing_url: "http://example.test" }), target), null);
  assert.equal(normalizeCardApiSale(sale({ title: "2022 Topps Tier One Tim Anderson Autograph TTA-JA 25/100" }), target), null);
});

test("exact target match requires identifier, print-run denominator, aliases, and raw condition", () => {
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Auto TTA-JA 25/100", target), true);
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Autograph TTA-JA 25/100", target), true);
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Autograph 25/100", target), false);
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Autograph TTA-JA 25/50", target), false);
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Autograph TTA-JA 25/100 PSA 10", target), false);
});


test("named parallels must match exactly and unresolved parallels never verify", () => {
  const namedParallel = {
    ...target,
    printRunMax: undefined,
    identity: { ...identity, edition: "Orange Laser" },
  };
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Auto TTA-JA Orange Laser", namedParallel), true);
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Auto TTA-JA Blue Laser", namedParallel), false);
  const unresolved = {
    ...target,
    printRunMax: undefined,
    identity: { ...identity, edition: "parallel unresolved from photo" },
  };
  assert.equal(cardApiExactTargetMatches("2022 Topps Tier One Jose Abreu Auto TTA-JA", unresolved), false);
});

test("identity terms use token boundaries and tolerate only narrow plural variation", () => {
  assert.equal(cardApiTitleMatches("2022 Topps Tier One Jose Abreu Auto TTA-JA 25/100", target.requiredTitleTerms), true);
  assert.equal(cardApiTitleMatches("2022 Topps Tier One Jose Abreu Automatic Insert TTA-JA 25/100", [...target.requiredTitleTerms, "Auto"]), false);
  assert.equal(cardApiTitleMatches("Pokemon 30th Celebrations Charizard", ["30th", "celebration", "charizard"]), true);
});

test("provider request uses broad providerQuery but still returns only strict matches", async () => {
  const secret = "test-secret-value";
  let capturedUrl;
  let capturedInit;
  const broadTarget = { ...target, providerQuery: "Jose Abreu TTA-JA" };
  const result = await fetchCardApiSales(broadTarget, {
    apiKey: secret,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({
          data: [
            sale(),
            sale({ id: "wrong", listing_url: "https://www.ebay.com/itm/999", title: "2022 Topps Tier One Tim Anderson Auto TTA-JA 25/100" }),
          ],
        }),
      };
    },
  });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.searchParams.get("q"), "Jose Abreu TTA-JA");
  assert.equal(capturedUrl.includes(secret), false);
  assert.equal(capturedInit.redirect, "manual");
  assert.equal(capturedInit.headers["x-market-api-key"], secret);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.returnedCount, 2);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.records.length, 1);
});

test("same-provider redirect is followed once without exposing the credential in the URL", async () => {
  const secret = "test-secret-value";
  const calls = [];
  const result = await fetchCardApiSales(target, {
    apiKey: secret,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return {
          ok: false,
          status: 307,
          headers: {
            get: (name) => name.toLowerCase() === "location"
              ? "https://www.thecardapi.com/api/v1/market/sales?q=Jose%20Abreu"
              : null,
          },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [sale()] }),
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[1].init.redirect, "error");
  assert.equal(new URL(calls[1].url).hostname, "www.thecardapi.com");
  assert.equal(calls[0].url.includes(secret), false);
  assert.equal(calls[1].url.includes(secret), false);
  assert.equal(calls[1].init.headers["x-market-api-key"], secret);
  assert.equal(result.status, "ok");
  assert.equal(result.acceptedCount, 1);
});

test("redirect outside Card API hosts is blocked before a second request", async () => {
  let calls = 0;
  const result = await fetchCardApiSales(target, {
    apiKey: "test-secret-value",
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 302,
        headers: { get: () => "https://example.com/not-the-provider" },
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "unsafe_redirect");
  assert.deepEqual(result.records, []);
});

test("duplicate provider rows cannot satisfy the two-sale verification threshold", async () => {
  const duplicate = sale();
  const result = await fetchCardApiSales(target, {
    apiKey: "test-secret-value",
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [duplicate, { ...duplicate }] }) }),
  });
  assert.equal(result.returnedCount, 2);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.records.length, 1);
  const verification = summarizeCardApiSales(result.records, 2);
  assert.equal(verification.status, "LOW_CONFIDENCE");
  assert.equal(verification.soldSampleCount, 1);
  assert.equal(verification.canClaimCompletedSalePriceSummary, false);
  assert.equal(verification.canClaimOtherTargetClaims, false);
});

test("two distinct exact sales allow only a completed-sale price summary", () => {
  const first = normalizeCardApiSale(sale(), target);
  const second = normalizeCardApiSale(sale({ id: "sale-2", listing_url: "https://www.ebay.com/itm/456", price: 55 }), target);
  const verification = summarizeCardApiSales([first, second], 2);
  assert.equal(verification.status, "VERIFIED");
  assert.equal(verification.soldSampleCount, 2);
  assert.equal(verification.soldLowUSD, 42.5);
  assert.equal(verification.soldHighUSD, 55);
  assert.equal(verification.canClaimCompletedSalePriceSummary, true);
  assert.equal(verification.canClaimOtherTargetClaims, false);
});

test("sports-card scripts stay review-only and use sold-only value evidence", () => {
  const registry = JSON.parse(fs.readFileSync(new URL("../data/know-it-all/sports-card-research-targets.json", import.meta.url), "utf8"));
  const scripts = JSON.parse(fs.readFileSync(new URL("../data/know-it-all/sports-card-video-scripts.json", import.meta.url), "utf8"));
  const ids = new Set(registry.targets.map((entry) => entry.id));
  assert.equal(scripts.state, "READY_FOR_REVIEW");
  assert.equal(scripts.publishAutomatically, false);
  assert.equal(scripts.publicCta, "https://www.blindboxai.com");
  assert.match(scripts.pricePolicy, /completed sold prices/i);
  assert.equal(scripts.noVerifiedSalesFallback.mode, "AUDIENCE_PRICE_QUESTION");
  assert.match(scripts.noVerifiedSalesFallback.hook, /pay for it raw/i);
  assert.match(scripts.noVerifiedSalesFallback.hook, /pay for it graded/i);
  assert.match(scripts.noVerifiedSalesFallback.disclosure, /audience research only/i);
  assert.match(scripts.noVerifiedSalesFallback.analyticsRule, /never be recorded as sales, sold prices/i);
  for (const entry of scripts.scripts) {
    assert.equal(ids.has(entry.researchTargetId), true);
    const publicText = `${entry.replacementTitle}\n${entry.voiceover.join(" ")}\n${entry.caption}`;
    assert.doesNotMatch(publicText, /\b(?:steal|invest(?:ment|or|ing)?|guarantee(?:d|s)? profit|price prediction)\b/i);
    assert.match(entry.caption, /https:\/\/www\.blindboxai\.com/);
    assert.match(entry.caption, /#ad/);
  }
});
