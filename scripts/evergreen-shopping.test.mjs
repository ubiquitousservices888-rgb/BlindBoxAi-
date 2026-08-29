import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShoppingCandidate, rankShoppingOpportunities, validateShoppingConfig } from "../lib/evergreen-shopping.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "data", "evergreen-shopping-opportunities.json"), "utf8"));

test("evergreen shopping config validates and ranks high-intent durable categories", () => {
  assert.doesNotThrow(() => validateShoppingConfig(config));
  const ranked = rankShoppingOpportunities(config);
  assert.equal(ranked[0].id, "clear-display-cases");
  assert.equal(ranked[1].id, "tiered-display-risers");
});

test("shopping candidate preserves BlindBoxAI CTA and requires channel-native eligibility", () => {
  const candidate = buildShoppingCandidate(config, {
    date: new Date("2026-08-29T16:10:00.000Z"),
    amazonEligible: false,
    youtubeShoppingEligible: false,
  });
  assert.equal(candidate.state, "READY_FOR_REVIEW");
  assert.match(candidate.publicCaption, /https:\/\/www\.blindboxai\.com/);
  assert.doesNotMatch(candidate.publicCaption, /amazon\.(?:com|to)\//i);
  assert.equal(candidate.productTagging.ready, false);
});

test("shopping tagging becomes ready only when both account gates are true", () => {
  const candidate = buildShoppingCandidate(config, {
    date: new Date("2026-08-29T16:10:00.000Z"),
    amazonEligible: true,
    youtubeShoppingEligible: true,
  });
  assert.equal(candidate.productTagging.ready, true);
  assert.equal(candidate.state, "READY_FOR_REVIEW");
});
