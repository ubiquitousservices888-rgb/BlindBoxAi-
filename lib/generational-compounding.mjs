import { AI_FAMILY_FEED, AI_FAMILY_PAGE } from "./ai-family-public.mjs";

export const COMPOUNDING_SCHEMA = "blindboxai.generational-compounding/v1";
export const COMPOUNDING_STATE = "READY_FOR_REVIEW";

const DEFAULT_MINIMUM_MEASURED_RUNS = 3;

function clean(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean))];
}

export function assertCompoundingSafety(cycle) {
  if (cycle?.state !== COMPOUNDING_STATE) {
    throw new Error("Compounding cycle must stop at READY_FOR_REVIEW");
  }
  if (cycle?.promotionGate?.automaticPromotion !== false) {
    throw new Error("Compounding cycle must not auto-promote a model, tool, prompt, or workflow");
  }
  if (cycle?.promotionGate?.requiresOwnerApproval !== true) {
    throw new Error("Compounding cycle requires explicit owner approval before promotion");
  }
  if (cycle?.baseline?.preserve !== true || cycle?.baseline?.overwrite !== false) {
    throw new Error("Compounding cycle must preserve the incumbent baseline");
  }
  if (cycle?.publishAutomatically !== false) {
    throw new Error("Compounding cycle must not publish automatically");
  }
  if (cycle?.aiFamily?.sharePrivateData !== false || cycle?.aiFamily?.automaticExternalSubmission !== false) {
    throw new Error("AI family feedback must remain public-safe and must not auto-submit private data");
  }
  return cycle;
}

export function buildCompoundingCycle(candidate, {
  generatedAt = new Date(),
  minimumMeasuredRuns = DEFAULT_MINIMUM_MEASURED_RUNS,
} = {}) {
  if (candidate?.state !== COMPOUNDING_STATE) {
    throw new Error("Only a READY_FOR_REVIEW candidate may enter generational compounding");
  }
  if (candidate?.publishAutomatically !== false) {
    throw new Error("Only a non-publishing candidate may enter generational compounding");
  }

  const cycleId = clean(candidate?.id, "candidate.id");
  const metrics = uniqueStrings(candidate?.feedbackPlan?.measure);
  if (!metrics.length) throw new Error("candidate.feedbackPlan.measure is required");

  const runs = Number(minimumMeasuredRuns);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("minimumMeasuredRuns must be a positive integer");
  }

  const cycle = {
    schema: COMPOUNDING_SCHEMA,
    state: COMPOUNDING_STATE,
    cycleId,
    publishAutomatically: false,
    framework: "preserve_measure_compare_promote_recycle",
    externalAsset: {
      type: "review_ready_narrative_candidate",
      id: cycleId,
      purpose: "Create a measurable BlindBoxAI audience/affiliate asset without bypassing review.",
    },
    internalAsset: {
      type: "reusable_learning_record",
      captures: [
        "verified_source_evidence",
        "hook_family",
        "review_outcome",
        "measured_performance",
        "generator_or_tool_version",
        "promotion_decision",
      ],
      purpose: "Make the next Flywheel cycle better instead of restarting from zero.",
    },
    baseline: {
      preserve: true,
      overwrite: false,
      incumbent: "current_best_owner_approved_workflow",
      rule: "A newer model, prompt, renderer, or workflow is a challenger until measured evidence proves an improvement.",
    },
    scorecard: {
      status: "PENDING_MEASUREMENT",
      metrics,
      compareOn: ["quality", "reliability", "speed", "cost", "qualified_engagement"],
      observations: {},
    },
    aiFamily: {
      mode: "public_safe_feedback",
      knowledgePage: AI_FAMILY_PAGE,
      machineReadableFeed: AI_FAMILY_FEED,
      feedbackTopics: [
        "factual_gaps",
        "citation_quality",
        "collector_usefulness",
        "qualified_engagement",
        "workflow_regressions",
        "model_or_tool_improvement",
      ],
      sharePrivateData: false,
      automaticExternalSubmission: false,
      rule: "Expose only approved public facts and non-identifying aggregate observations. Never send secrets, owner credentials, raw private analytics, private email, or confidential buyer information to external AI systems.",
    },
    promotionGate: {
      requiresOwnerApproval: true,
      automaticPromotion: false,
      minimumMeasuredRuns: runs,
      rule: "Promote a challenger only after repeated measured improvement and explicit owner approval; otherwise preserve the incumbent.",
    },
    recyclePlan: {
      preserve: ["successful_outputs", "failed_outputs", "review_notes", "measured_results", "eval_cases"],
      nextUse: ["future_candidate_selection", "prompt_or_tool_evaluation", "regression_testing", "public_safe_ai_feedback"],
    },
    generatedAt: generatedAt.toISOString(),
  };

  return assertCompoundingSafety(cycle);
}

export function buildCompoundingPreview(cycle) {
  assertCompoundingSafety(cycle);
  return [
    `# Generational Compounding — ${cycle.cycleId}`,
    "",
    `**State:** ${cycle.state}`,
    `**Framework:** ${cycle.framework}`,
    `**Measurement:** ${cycle.scorecard.status}`,
    "",
    "## Two assets from this cycle",
    "",
    `- External: ${cycle.externalAsset.type} — ${cycle.externalAsset.purpose}`,
    `- Internal: ${cycle.internalAsset.type} — ${cycle.internalAsset.purpose}`,
    "",
    "## AI family feedback",
    "",
    `- Public knowledge page: ${cycle.aiFamily.knowledgePage}`,
    `- Machine-readable feed: ${cycle.aiFamily.machineReadableFeed}`,
    "- Private data sharing: disabled.",
    "- Automatic external submission: disabled.",
    "",
    "## Promotion gate",
    "",
    `- Minimum measured runs: ${cycle.promotionGate.minimumMeasuredRuns}`,
    "- Automatic promotion: disabled.",
    "- Explicit owner approval: required.",
    "- Incumbent baseline: preserved until a challenger wins on measured evidence.",
    "",
    "## Recycle forward",
    "",
    ...cycle.recyclePlan.preserve.map((item) => `- ${item}`),
    "",
  ].join("\n");
}
