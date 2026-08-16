import assert from "node:assert/strict";
import { DISCLOSURE, generateVideoScript } from "../lib/video-pipeline.mjs";
import {
  AUDIBLE_EPN_DISCLOSURE,
  disclosureFirstCaption,
  hardenGenerativeVideoScript,
  isEbayDataSource,
  sanitizeProductForGenerativeVideo,
} from "../lib/epn-genai-safety.mjs";

const now = new Date("2026-08-16T12:00:00Z");
const product = {
  id: "mixed-evidence",
  name: "Mixed Evidence Collectible",
  productUrl: "https://www.blindboxai.com/series/mixed-evidence",
  sources: [
    { id: "official-brand", status: "verified", url: "https://www.popmart.com/us/products/1/example", checkedAt: "2026-08-16T10:00:00Z" },
    { id: "ebay-sold", status: "verified", url: "https://www.ebay.com/sch/i.html?_nkw=example", checkedAt: "2026-08-16T10:00:00Z" },
  ],
  claims: [
    { text: "Official brand fact.", sourceId: "official-brand" },
    { text: "eBay-derived sold-price fact.", sourceId: "ebay-sold" },
  ],
};

assert.equal(isEbayDataSource(product.sources[1]), true);
assert.equal(isEbayDataSource(product.sources[0]), false);

const safe = sanitizeProductForGenerativeVideo(product);
assert.deepEqual(safe.sources.map((source) => source.id), ["official-brand"]);
assert.deepEqual(safe.claims.map((claim) => claim.text), ["Official brand fact."]);
assert.ok(!JSON.stringify(safe).includes("ebay.com"));
assert.ok(!JSON.stringify(safe).includes("sold-price"));

const base = generateVideoScript(safe, now);
const hardened = hardenGenerativeVideoScript(base, DISCLOSURE);
assert.ok(hardened.displayTitle.startsWith("#ad • "));
assert.ok(hardened.narration.startsWith(AUDIBLE_EPN_DISCLOSURE));
assert.ok(hardened.caption.startsWith(DISCLOSURE));

const reordered = disclosureFirstCaption(`Title\n\nhttps://blindboxai.com\n\n${DISCLOSURE}`, DISCLOSURE);
assert.ok(reordered.startsWith(DISCLOSURE));
assert.equal(reordered.split(DISCLOSURE).length - 1, 1);

assert.throws(() => sanitizeProductForGenerativeVideo({
  ...product,
  sources: [product.sources[1]],
  claims: [product.claims[1]],
}), /No non-eBay claims/);

console.log("EPN GenAI safety tests passed");
