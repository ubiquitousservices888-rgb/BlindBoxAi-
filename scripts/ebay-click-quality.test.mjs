import assert from "node:assert/strict";
import test from "node:test";

import { classifyAmazonBeaconRequest } from "../app/api/events/amazon-affiliate-click/quality.mjs";
import { classifyEbayAffiliateRequest, shouldSuppressAutomatedEbayAffiliateRequest } from "../app/api/out/ebay-quality.mjs";

function request() {
  return {
    method: "GET",
    headers: { get() { return "Mozilla/5.0"; } },
  };
}

const FALLBACK = { clientClass: "unclassified", qualityReason: "classifier_error" };

function throwingClassifier() {
  throw new Error("classifier unavailable");
}

test("eBay wrapper fails closed for thrown and malformed classifier results", () => {
  const invalidClassifiers = [
    throwingClassifier,
    () => null,
    () => ({}),
    () => ({ clientClass: "", qualityReason: "" }),
    () => ({ clientClass: "human_candidate" }),
    () => ({ qualityReason: "default_candidate" }),
  ];

  for (const classifier of invalidClassifiers) {
    assert.deepEqual(classifyEbayAffiliateRequest(request(), classifier), FALLBACK);
  }
});

test("eBay wrapper preserves valid coarse classifier output", () => {
  assert.deepEqual(
    classifyEbayAffiliateRequest(
      request(),
      () => ({ clientClass: "human_candidate", qualityReason: "default_candidate" }),
    ),
    { clientClass: "human_candidate", qualityReason: "default_candidate" },
  );
});

test("eBay and Amazon use the same failure values behaviorally", () => {
  assert.deepEqual(
    classifyEbayAffiliateRequest(request(), throwingClassifier),
    classifyAmazonBeaconRequest(request(), throwingClassifier),
  );
  assert.deepEqual(classifyEbayAffiliateRequest(request(), throwingClassifier), FALLBACK);
});

test("known automated traffic must never become an outbound eBay referral", () => {
  for (const clientClass of ["bot", "prefetch", "head"]) {
    assert.equal(shouldSuppressAutomatedEbayAffiliateRequest({ clientClass }), true);
  }
  for (const clientClass of ["unclassified", "human_candidate", "unknown", ""]) {
    assert.equal(shouldSuppressAutomatedEbayAffiliateRequest({ clientClass }), false);
  }
  assert.equal(shouldSuppressAutomatedEbayAffiliateRequest(null), false);
});

test("realistic shopper traffic is not suppressed; obvious crawler and prefetch are", () => {
  const shoppers = [
    new Request("https://blindboxai.com/api/out/ebay", {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 17) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" },
    }),
    new Request("https://blindboxai.com/api/out/ebay", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" },
    }),
  ];
  for (const shopper of shoppers) {
    assert.equal(shouldSuppressAutomatedEbayAffiliateRequest(classifyEbayAffiliateRequest(shopper)), false);
  }
  for (const request of [
    new Request("https://blindboxai.com/api/out/ebay", { headers: { "user-agent": "curl/8.1" } }),
    new Request("https://blindboxai.com/api/out/ebay", {
      headers: { "user-agent": "Mozilla/5.0", purpose: "prefetch" },
    }),
  ]) {
    assert.equal(shouldSuppressAutomatedEbayAffiliateRequest(classifyEbayAffiliateRequest(request)), true);
  }
});
