export const AFFILIATE_ELIGIBILITY_SCHEMA = "blindboxai.affiliate-eligibility/v1";
export const AFFILIATE_SCOPE = "all-blind-box-collectibles";
export const MARKET_CURRENCY = "USD";
export const MARKET_CRITERION = "reviewed-positive-usd-transaction-evidence";

const PLACEHOLDER_PATTERNS = [
  /\bADD_[A-Z0-9_]+\b/i,
  /\bREPLACE_[A-Z0-9_]+\b/i,
  /\bINSERT_[A-Z0-9_]+\b/i,
  /\bYOUR_[A-Z0-9_]+\b/i,
  /example\.com/i,
  /\bplaceholder\b/i,
];

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function reviewedMarketRecord(figure) {
  if (!figure || figure.needsReview !== false) return null;

  const resaleLowUSD = positiveMoney(figure.resaleLow);
  const resaleHighUSD = positiveMoney(figure.resaleHigh);
  if (resaleLowUSD == null || resaleHighUSD == null || resaleHighUSD < resaleLowUSD) {
    return null;
  }

  const figureName = typeof figure.name === "string" ? figure.name.trim().replace(/\s+/g, " ") : "";
  const transactionEvidence = typeof figure.evidence === "string" ? figure.evidence.trim().replace(/\s+/g, " ") : "";
  if (!figureName || !transactionEvidence) return null;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(figureName) || pattern.test(transactionEvidence))) {
    return null;
  }

  return {
    figure: figureName,
    reviewStatus: "verified",
    rarity: typeof figure.rarity === "string" && figure.rarity.trim()
      ? figure.rarity.trim()
      : "unspecified",
    resaleLowUSD,
    resaleHighUSD,
    transactionEvidence,
  };
}

export function evaluateAffiliateEligibility(series) {
  const verifiedMarketRecords = Array.isArray(series?.figures)
    ? series.figures.map(reviewedMarketRecord).filter(Boolean)
    : [];

  const eligible = verifiedMarketRecords.length > 0;
  return {
    schema: AFFILIATE_ELIGIBILITY_SCHEMA,
    scope: AFFILIATE_SCOPE,
    eligible,
    status: eligible ? "eligible" : "ineligible",
    currency: MARKET_CURRENCY,
    criterion: MARKET_CRITERION,
    verifiedMarketRecordCount: verifiedMarketRecords.length,
    verifiedMarketRecords,
    reasons: eligible
      ? []
      : ["At least one figure must have needsReview=false, a positive USD resale range, and non-placeholder transaction evidence."],
  };
}

export function assertAffiliateEligibilityRecord(eligibility) {
  if (eligibility?.schema !== AFFILIATE_ELIGIBILITY_SCHEMA) {
    throw new Error("Affiliate eligibility schema is missing or invalid");
  }
  if (eligibility.scope !== AFFILIATE_SCOPE || eligibility.currency !== MARKET_CURRENCY) {
    throw new Error("Affiliate eligibility must cover all blind-box collectibles with USD market evidence");
  }
  if (eligibility.eligible !== true || eligibility.status !== "eligible" || eligibility.criterion !== MARKET_CRITERION) {
    throw new Error("Collectible is not eligible for affiliate marketing");
  }
  if (!Array.isArray(eligibility.verifiedMarketRecords) || !eligibility.verifiedMarketRecords.length) {
    throw new Error("Affiliate eligibility requires verified positive-USD transaction evidence");
  }
  if (eligibility.verifiedMarketRecordCount !== eligibility.verifiedMarketRecords.length) {
    throw new Error("Affiliate eligibility evidence count does not match its records");
  }
  for (const record of eligibility.verifiedMarketRecords) {
    if (record?.reviewStatus !== "verified" || !reviewedMarketRecord({
      name: record?.figure,
      rarity: record?.rarity,
      resaleLow: record?.resaleLowUSD,
      resaleHigh: record?.resaleHighUSD,
      evidence: record?.transactionEvidence,
      needsReview: false,
    })) {
      throw new Error("Affiliate eligibility contains an invalid market record");
    }
  }
  return true;
}

export function assertAffiliateEligibleSeries(series) {
  const eligibility = evaluateAffiliateEligibility(series);
  if (!eligibility.eligible) {
    const identity = series?.slug || series?.name || "series";
    throw new Error(`${identity}: ${eligibility.reasons[0]}`);
  }
  assertAffiliateEligibilityRecord(eligibility);
  return eligibility;
}
