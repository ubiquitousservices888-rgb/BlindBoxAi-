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
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function scoreCollectibleOpportunity(input = {}) {
  const factors = Object.fromEntries(FACTORS.map((key) => [key, bounded(input[key])]));
  const missing = FACTORS.filter((key) => factors[key] == null);

  const soldSampleCount = Math.max(0, Math.floor(Number(input.soldSampleCount) || 0));
  const completedSaleEvidence = input.completedSaleEvidence === true && soldSampleCount >= 2;
  const affiliateEconomicsVerified = input.affiliateEconomicsVerified === true;
  const singleSourceConclusion = input.singleSourceConclusion === true;

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
  // by strong unrelated factors.
  const normalized = FACTORS.map((key) => Math.max(1, factors[key]) / 100);
  const score = Math.round(
    Math.pow(normalized.reduce((product, value) => product * value, 1), 1 / FACTORS.length) * 100,
  );

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
