export const COLLECTIBLE_OPPORTUNITY_SCHEMA = "blindboxai.collectible-opportunity/v1";

const FACTORS = Object.freeze([
  "buyerIntent",
  "transactionValue",
  "conversionOpportunity",
  "monetizationFit",
  "evidenceConfidence",
  "liquidity",
  "sellThrough",
]);

function bounded(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function finiteSampleCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function scoreCollectibleOpportunity(input = {}) {
  const factors = Object.fromEntries(FACTORS.map((key) => [key, bounded(input[key])]));
  const missing = FACTORS.filter((key) => factors[key] == null);

  const soldSampleCount = finiteSampleCount(input.soldSampleCount);
  const completedSaleEvidence = input.completedSaleEvidence === true && soldSampleCount >= 2;
  const affiliateEconomicsVerified = input.affiliateEconomicsVerified === true;
  const singleSourceConclusion = input.singleSourceConclusion !== false;

  const rejectReasons = [];
  if (!completedSaleEvidence) rejectReasons.push("requires at least two verified completed-sale samples");
  if (!affiliateEconomicsVerified) rejectReasons.push("affiliate economics are not verified");
  if (singleSourceConclusion) rejectReasons.push("single-source market conclusion is not eligible");
  if (missing.length) rejectReasons.push(`missing score factors: ${missing.join(", ")}`);

  if (rejectReasons.length) {
    return {
      schema: COLLECTIBLE_OPPORTUNITY_SCHEMA,
      eligible: false,
      score: null,
      factors,
      soldSampleCount,
      rejectReasons,
    };
  }

  // Geometric mean mirrors the research mandate's multiplicative formula:
  // one weak factor materially lowers the opportunity instead of being hidden
  // by strong unrelated factors. A zero factor therefore yields a zero score.
  const normalized = FACTORS.map((key) => factors[key] / 100);
  const rawScore = Math.pow(
    normalized.reduce((product, value) => product * value, 1),
    1 / FACTORS.length,
  ) * 100;
  const score = Math.round(rawScore);

  return {
    schema: COLLECTIBLE_OPPORTUNITY_SCHEMA,
    eligible: true,
    score,
    factors,
    soldSampleCount,
    rejectReasons: [],
  };
}

export function rankCollectibleOpportunities(items = []) {
  if (!Array.isArray(items)) throw new Error("Opportunity input must be an array");
  return items
    .map((item) => ({ ...item, opportunity: scoreCollectibleOpportunity(item) }))
    .filter((item) => item.opportunity.eligible)
    .sort((a, b) => b.opportunity.score - a.opportunity.score);
}
