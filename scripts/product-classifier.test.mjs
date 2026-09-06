import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AMAZON_ASSOCIATE_TAG, amazonOutboundPath, buildAmazonSearchUrl } from "../lib/amazon-associates.mjs";
import { EPN_MKRID, auditEpnUrl, buildEbaySearchUrl } from "../lib/affiliate-policy.mjs";
import {
  STATES,
  assertPublishableState,
  createRenderRecord,
  generateVideoScript,
  markRendered,
  validateAffiliatePathForProduct,
} from "../lib/video-pipeline.mjs";
import { classifyProduct } from "../lib/product-classifier.mjs";
import { resolveAccessoryOfferId, routeProductToAffiliate } from "../lib/monetization-router.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");
const baseProduct = {
  id: "verified-product",
  name: "Verified Product",
  productUrl: "https://blindboxai.com/series/verified-product",
  sources: [{ id: "official", url: "https://brand.example/product", checkedAt: "2026-08-08T12:00:00.000Z", status: "verified" }],
  claims: [{ text: "Verified claim.", sourceId: "official" }],
};

function printResult(testName, product, classification, route, pass) {
  console.log(
    `${testName} | input=${JSON.stringify({ id: product.id, name: product.name, brand: product.brand ?? "" })} | classification=${JSON.stringify(classification)} | affiliate=${JSON.stringify(route)} | status=${pass ? "PASS" : "FAIL"}`,
  );
}

function assertCase(testName, product, expectedType, expectedPath) {
  const classification = classifyProduct(product);
  const route = routeProductToAffiliate(product);
  const pass = classification.type === expectedType && route.path === expectedPath;
  printResult(testName, product, classification, route, pass);
  assert.equal(classification.type, expectedType);
  assert.equal(route.path, expectedPath);
}

describe("product classifier and monetization router", () => {
  it("1. POP MART figure routes to eBay", () => {
    const product = { ...baseProduct, id: "popmart", name: "POP MART CRYBABY blind box figure", brand: "POP MART" };
    assertCase("POP MART figure", product, "figure", "ebay");
  });

  it("2. Sonny Angel figure routes to eBay", () => {
    const product = { ...baseProduct, id: "sonny", name: "Sonny Angel mini figure", brand: "Sonny Angel" };
    assertCase("Sonny Angel figure", product, "figure", "ebay");
  });

  it("3. Smiski figure routes to eBay", () => {
    const product = { ...baseProduct, id: "smiski", name: "Smiski blind-box figure", brand: "Smiski" };
    assertCase("Smiski figure", product, "figure", "ebay");
  });

  it("4. Display case routes to Amazon", () => {
    const product = { ...baseProduct, id: "display-case", name: "Acrylic display case for blind box collection" };
    assertCase("Display case", product, "accessory", "amazon");
  });

  it("5. Protective case routes to Amazon", () => {
    const product = { ...baseProduct, id: "protective-case", name: "Protective case with dust cover for figures" };
    assertCase("Protective case", product, "accessory", "amazon");
  });

  it("6. Storage organizer routes to Amazon", () => {
    const product = { ...baseProduct, id: "storage-organizer", name: "Storage organizer for collectible accessories" };
    assertCase("Storage organizer", product, "accessory", "amazon");
  });

  it("7. Unknown product stays none and never Amazon", () => {
    const product = { ...baseProduct, id: "unknown", name: "Mystery collector thing" };
    const classification = classifyProduct(product);
    const route = routeProductToAffiliate(product);
    const pass = classification.type === "unknown" && route.path === "none";
    printResult("Unknown product", product, classification, route, pass);
    assert.equal(classification.type, "unknown");
    assert.equal(route.path, "none");
    assert.notEqual(route.path, "amazon");
  });

  it("8. eBay tracking parameters remain unchanged", () => {
    const product = { ...baseProduct, id: "popmart-epn", name: "POP MART SKULLPANDA figure", brand: "POP MART" };
    const classification = classifyProduct(product);
    const route = routeProductToAffiliate(product);
    const url = new URL(buildEbaySearchUrl({ query: product.name, kind: "active", campid: "1234567", customId: "bb1-route-test" }));
    const audit = auditEpnUrl(url, { kind: "active", requireTracking: true });
    const pass = classification.type === "figure" && route.path === "ebay" && audit.ok;
    printResult("eBay tracking unchanged", product, classification, route, pass);
    assert.equal(url.searchParams.get("mkcid"), "1");
    assert.equal(url.searchParams.get("mkrid"), EPN_MKRID);
    assert.equal(url.searchParams.get("siteid"), "0");
    assert.equal(url.searchParams.get("campid"), "1234567");
    assert.equal(url.searchParams.get("toolid"), "10001");
    assert.equal(url.searchParams.get("mkevt"), "1");
    assert.equal(audit.ok, true);
  });

  it("9. Amazon tag is exactly blindboxai-20", () => {
    const product = { ...baseProduct, id: "lighting", name: "Display lighting for acrylic case" };
    const classification = classifyProduct(product);
    const route = routeProductToAffiliate(product);
    const offerId = resolveAccessoryOfferId(product);
    const target = new URL(buildAmazonSearchUrl(offerId));
    const pass = classification.type === "accessory" && route.path === "amazon" && target.searchParams.get("tag") === AMAZON_ASSOCIATE_TAG;
    printResult("Amazon tag exact", product, classification, route, pass);
    assert.equal(target.searchParams.get("tag"), "blindboxai-20");
  });

  it("10. Amazon path stays direct and not via eBay out route", () => {
    const product = { ...baseProduct, id: "turntable", name: "Motorized display turntable for figures" };
    const classification = classifyProduct(product);
    const route = routeProductToAffiliate(product);
    const offerId = resolveAccessoryOfferId(product);
    const outbound = amazonOutboundPath(offerId, { source: "video_pipeline" });
    const pass = classification.type === "accessory" && route.path === "amazon" && outbound.startsWith("/api/out/amazon?") && !outbound.includes("/api/out/ebay");
    printResult("Amazon direct path", product, classification, route, pass);
    assert.ok(outbound.startsWith("/api/out/amazon?"));
    assert.ok(!outbound.includes("/api/out/ebay"));
  });

  it("11. Human approval remains required before publishing", () => {
    const product = { ...baseProduct, id: "approval-check", name: "POP MART Mega blind box" };
    const classification = classifyProduct(product);
    const route = routeProductToAffiliate(product);
    const script = generateVideoScript(product, now);
    const record = markRendered(createRenderRecord(product, script, ["tiktok"], now), { id: "render-1", videoUrl: "https://cdn.example/video.mp4" }, now);
    const affiliateValidation = validateAffiliatePathForProduct(product);
    const pass = classification.type === "figure" && route.path === "ebay" && affiliateValidation.status !== "NONE";
    printResult("Approval still required", product, classification, route, pass);
    assert.equal(affiliateValidation.status, "EBAY");
    assert.ok(affiliateValidation.audit.some((entry) => entry === "route:ebay"));
    assert.ok(affiliateValidation.audit.some((entry) => entry.startsWith("ebay_url:https://www.ebay.com/")));
    assert.equal(record.state, STATES.READY);
    assert.throws(() => assertPublishableState(record), /Manual approval is required/);
  });
});
