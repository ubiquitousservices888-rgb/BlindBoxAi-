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

const WRITTEN_COUNTS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function documentedSaleCount(figure, transactionEvidence) {
  if (Array.isArray(figure?.saleEvidence)) {
    const completed = figure.saleEvidence.filter((entry) => {
      const status = String(entry?.status ?? entry?.type ?? "").toLowerCase();
      return status ? /(sold|completed|sale|transaction)/.test(status) : true;
    });
    if (completed.length) return completed.length;
  }

  const explicitCount = transactionEvidence.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:firm\s+|completed\s+|reviewed\s+)?(?:US\s+)?(?:sold\s+)?(?:sales|transactions|completed sales)\b/i);
  if (explicitCount) {
    const raw = explicitCount[1].toLowerCase();
    return /^\d+$/.test(raw) ? Number(raw) : WRITTEN_COUNTS[raw] ?? 0;
  }

  const singular = /\b(?:1\s+|one\s+)?(?:US\s+)?(?:sale|completed transaction|completed sale)\b/i.test(transactionEvidence);
  return singular ? 1 : 0;
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

  const completedSaleCount = documentedSaleCount(figure, transactionEvidence);
  if (completedSaleCount < 2) return null;

  return {
    figure: figureName,
    reviewStatus: "verified",
    rarity: typeof figure.rarity === "string" && figure.rarity.trim()
      ? figure.rarity.trim()
      : "unspecified",
    resaleLowUSD,
    resaleHighUSD,
    transactionEvidence,
    completedSaleCount,
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
      : ["At least one figure must have needsReview=false, a positive USD resale range, non-placeholder evidence, and at least two documented completed sales."],
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
    if (record?.reviewStatus !== "verified" || Number(record?.completedSaleCount) < 2) {
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
