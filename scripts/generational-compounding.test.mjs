import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPOUNDING_STATE,
  assertCompoundingSafety,
  buildCompoundingCycle,
} from "../lib/generational-compounding.mjs";

function candidate() {
  return {
    id: "2026-09-04-test-collector-signal",
    state: "READY_FOR_REVIEW",
    publishAutomatically: false,
    feedbackPlan: {
      measure: ["impressions", "video_views", "clicks", "saves", "comments"],
    },
  };
}

test("compounding cycle preserves baseline and stops at review", () => {
  const cycle = buildCompoundingCycle(candidate(), {
    generatedAt: new Date("2026-09-04T12:00:00Z"),
  });

  assert.equal(cycle.state, COMPOUNDING_STATE);
  assert.equal(cycle.publishAutomatically, false);
  assert.equal(cycle.baseline.preserve, true);
  assert.equal(cycle.baseline.overwrite, false);
  assert.equal(cycle.promotionGate.automaticPromotion, false);
  assert.equal(cycle.promotionGate.requiresOwnerApproval, true);
  assert.equal(cycle.promotionGate.minimumMeasuredRuns, 3);
  assert.equal(cycle.externalAsset.type, "review_ready_narrative_candidate");
  assert.equal(cycle.internalAsset.type, "reusable_learning_record");
});

test("challenger cannot be auto-promoted", () => {
  const cycle = buildCompoundingCycle(candidate());
  cycle.promotionGate.automaticPromotion = true;
  assert.throws(() => assertCompoundingSafety(cycle), /must not auto-promote/);
});

test("owner approval cannot be removed", () => {
  const cycle = buildCompoundingCycle(candidate());
  cycle.promotionGate.requiresOwnerApproval = false;
  assert.throws(() => assertCompoundingSafety(cycle), /requires explicit owner approval/);
});

test("incumbent baseline cannot be overwritten", () => {
  const cycle = buildCompoundingCycle(candidate());
  cycle.baseline.overwrite = true;
  assert.throws(() => assertCompoundingSafety(cycle), /preserve the incumbent baseline/);
});

test("publishing candidates cannot enter compounding", () => {
  const unsafe = candidate();
  unsafe.publishAutomatically = true;
  assert.throws(() => buildCompoundingCycle(unsafe), /non-publishing candidate/);
});

test("measurement plan is required", () => {
  const missingMetrics = candidate();
  missingMetrics.feedbackPlan.measure = [];
  assert.throws(() => buildCompoundingCycle(missingMetrics), /feedbackPlan.measure is required/);
});
