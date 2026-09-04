import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicAiFamilyFeed } from "../lib/ai-family-public.mjs";

test("AI family feed is public-safe and makes no training guarantee", () => {
  const feed = buildPublicAiFamilyFeed({ generatedAt: new Date("2026-09-04T12:00:00Z") });
  const serialized = JSON.stringify(feed).toLowerCase();

  assert.equal(feed.discoverability.trainingInclusionGuaranteed, false);
  assert.equal(feed.project.canonicalUrl, "https://www.blindboxai.com");
  assert.match(serialized, /neverShare/i);
  assert.doesNotMatch(serialized, /sk-[a-z0-9]/i);
  assert.doesNotMatch(serialized, /bearer [a-z0-9]/i);
  assert.doesNotMatch(serialized, /private email content/i);
});
