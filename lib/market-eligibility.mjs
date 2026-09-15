export const AFFILIATE_ELIGIBILITY_SCHEMA = "blindboxai.affiliate-eligibility/v1";
export const AFFILIATE_SCOPE = "all-blind-box-collectibles";
export const MARKET_CURRENCY = "USD";
export const MARKET_CRITERION = "reviewed-positive-usd-transaction-evidence";
export const PUBLIC_PRICE_FRESHNESS_DAYS = 30;

const PLACEHOLDER_PATTERNS = [
  /\bADD_[A-Z0-9_]+\b/i,
  /\bREPLACE_[A-Z0-9_]+\b/i,
  /\bINSERT_[A-Z0-9_]+\b/i,
  /\bYOUR_[A-Z0-9_]+\b/i,
  /example\.com/i,
  /\bplaceholder\b/i,
];

const WRITTEN_COUNTS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });
const MONTHS = Object.freeze({ jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 });

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function completedSaleEntries(figure) {
  if (!Array.isArray(figure?.saleEvidence)) return [];
  return figure.saleEvidence.filter((entry) => {
    const status = String(entry?.status ?? entry?.type ?? "").toLowerCase();
    return status ? /(sold|completed|sale|transaction)/.test(status) : true;
  });
}

function documentedSaleCount(figure, transactionEvidence) {
  const completed = completedSaleEntries(figure);
  if (completed.length) return completed.length;

  const explicitCount = transactionEvidence.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:firm\s+|completed\s+|reviewed\s+)?(?:US\s+)?(?:sold\s+)?(?:sales|transactions|completed sales)\b/i);
  if (explicitCount) {
    const raw = explicitCount[1].toLowerCase();
    return /^\d+$/.test(raw) ? Number(raw) : WRITTEN_COUNTS[raw] ?? 0;
  }

  const singular = /\b(?:1\s+|one\s+)?(?:US\s+)?(?:sale|completed transaction|completed sale)\b/i.test(transactionEvidence);
  return singular ? 1 : 0;
}

function isoDay(value) {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function textSaleDates(transactionEvidence) {
  const dates = [];
  for (const value of transactionEvidence.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []) {
    const parsed = isoDay(`${value}T00:00:00Z`);
    if (parsed) dates.push(parsed);
  }

  const years = [...transactionEvidence.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const year = years.length && years.every((value) => value === years[0]) ? years[0] : null;
  if (year) {
    for (const match of transactionEvidence.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/gi)) {
      const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
      const day = Number(match[2]);
      if (!Number.isInteger(month) || day < 1 || day > 31) continue;
      const parsed = isoDay(new Date(Date.UTC(year, month, day)).toISOString());
      if (parsed) dates.push(parsed);
    }
  }
  return dates;
}

export function latestDocumentedSaleAt(figure, transactionEvidence = String(figure?.evidence ?? "")) {
  const dates = [];
  for (const entry of completedSaleEntries(figure)) {
    const parsed = isoDay(entry?.soldAt ?? entry?.observedAt ?? entry?.completedAt ?? entry?.date);
    if (parsed) dates.push(parsed);
  }
  dates.push(...textSaleDates(String(transactionEvidence ?? "")));
  if (!dates.length) return null;
  return dates.sort((a, b) => Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`))[0];
}

export function marketFreshness(latestSaleAt, { now = new Date(), maxAgeDays = PUBLIC_PRICE_FRESHNESS_DAYS } = {}) {
  if (!latestSaleAt) {
    return { latestSaleAt: null, ageDays: null, freshnessStatus: "unknown", fresh: false, freshnessWindowDays: maxAgeDays };
  }
  const latestTime = Date.parse(`${latestSaleAt}T00:00:00Z`);
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(latestTime) || !Number.isFinite(nowTime)) {
    return { latestSaleAt: null, ageDays: null, freshnessStatus: "unknown", fresh: false, freshnessWindowDays: maxAgeDays };
  }
  const ageDays = Math.floor((nowTime - latestTime) / 86_400_000);
  if (ageDays < -1) {
    return { latestSaleAt, ageDays, freshnessStatus: "unknown", fresh: false, freshnessWindowDays: maxAgeDays };
  }
  const fresh = ageDays <= maxAgeDays;
  return {
    latestSaleAt,
    ageDays,
    freshnessStatus: fresh ? "fresh" : "dated",
    fresh,
    freshnessWindowDays: maxAgeDays,
  };
}

function reviewedMarketRecord(figure, options = {}) {
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

  const latestSaleAt = latestDocumentedSaleAt(figure, transactionEvidence);
  const freshness = marketFreshness(latestSaleAt, options);

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
    ...freshness,
  };
}

export function evaluateAffiliateEligibility(series, options = {}) {
  const verifiedMarketRecords = Array.isArray(series?.figures)
    ? series.figures.map((figure) => reviewedMarketRecord(figure, options)).filter(Boolean)
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
    if (!["fresh", "dated", "unknown"].includes(record?.freshnessStatus)) {
      throw new Error("Affiliate eligibility contains an invalid freshness state");
    }
  }
  return true;
}

export function assertAffiliateEligibleSeries(series, options = {}) {
  const eligibility = evaluateAffiliateEligibility(series, options);
  if (!eligibility.eligible) {
    const identity = series?.slug || series?.name || "series";
    throw new Error(`${identity}: ${eligibility.reasons[0]}`);
  }
  assertAffiliateEligibilityRecord(eligibility);
  return eligibility;
}
