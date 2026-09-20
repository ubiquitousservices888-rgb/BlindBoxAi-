import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  allOwnerCardListings,
  getOwnerCardListing,
  isEpnGenAiPromotionApproved,
  ownerCardBrowseItemId,
  ownerCardLandingPath,
} from "../lib/owner-card-listings.mjs";

const route = fs.readFileSync(new URL("../app/api/out/owner-card/route.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/cards/[id]/page.jsx", import.meta.url), "utf8");

test("owner card listing allowlist contains only verified mappings", () => {
  const listings = allOwnerCardListings();
  assert.equal(listings.length, 5);
  assert.equal(new Set(listings.map(item => item.researchTargetId)).size, listings.length);
  assert.equal(new Set(listings.map(item => item.legacyItemId)).size, listings.length);
  for (const item of listings) {
    assert.match(item.legacyItemId, /^\d{9,12}$/);
    assert.equal(item.browseItemId, `v1|${item.legacyItemId}|0`);
    assert.ok(item.identity?.item);
  }
});

test("verified Gmail-matched cards resolve to the expected eBay legacy IDs", () => {
  assert.equal(getOwnerCardListing("2022-topps-tier-one-jose-abreu-t1ta-ja-auto-149")?.legacyItemId, "800688862744");
  assert.equal(getOwnerCardListing("2021-bowman-platinum-nick-gonzales-pe-23-auto")?.legacyItemId, "800688881524");
  assert.equal(getOwnerCardListing("2020-21-panini-obsidian-killian-hayes-rji-klh-99")?.legacyItemId, "800688913602");
  assert.equal(getOwnerCardListing("2021-topps-triple-threads-tanner-houck-asjr-th-99")?.legacyItemId, "800688924233");
  assert.equal(getOwnerCardListing("2021-panini-chronicles-crusade-andrew-vaughn-15-green-75")?.legacyItemId, "800688873985");
  assert.equal(getOwnerCardListing("unknown"), null);
});

test("Browse item IDs and social landing paths are deterministic", () => {
  assert.equal(ownerCardBrowseItemId("800688862744"), "v1|800688862744|0");
  assert.throws(() => ownerCardBrowseItemId("not-an-item"), /verified legacy eBay item ID/i);
  assert.equal(
    ownerCardLandingPath("2022-topps-tier-one-jose-abreu-t1ta-ja-auto-149", {
      campaignId: "youtube-jose-0920",
      source: "youtube",
    }),
    "/cards/2022-topps-tier-one-jose-abreu-t1ta-ja-auto-149?campaign=youtube-jose-0920&source=youtube",
  );
});

test("EPN GenAI approval fails closed unless explicitly true", () => {
  assert.equal(isEpnGenAiPromotionApproved({}), false);
  assert.equal(isEpnGenAiPromotionApproved({ EPN_GENAI_PROMOTIONAL_METHOD_APPROVED: "false" }), false);
  assert.equal(isEpnGenAiPromotionApproved({ EPN_GENAI_PROMOTIONAL_METHOD_APPROVED: "true" }), true);
  assert.equal(isEpnGenAiPromotionApproved({ EPN_GENAI_PROMOTIONAL_METHOD_APPROVED: "TRUE" }), true);
});

test("owner-card outbound route is allowlisted, attributed, disclosed, and approval-gated", () => {
  assert.match(route, /getOwnerCardListing\(researchTargetId\)/);
  assert.match(route, /isEpnGenAiPromotionApproved\(\)/);
  assert.match(route, /getEbayProductionItem/);
  assert.match(route, /recordAffiliateClick/);
  assert.doesNotMatch(route, /searchParams\.get\(["']item["']\)/);
  assert.match(page, /As an eBay Partner, BlindBoxAI may be compensated/);
  assert.match(page, /rel="sponsored nofollow noopener noreferrer"/);
  assert.match(page, /\/api\/out\/owner-card/);
});
