export const PRICE_VERIFICATION_SCHEMA = "blindboxai.collectible-price-verification/v1";

const TYPES = new Set(["msrp", "active_ask", "highest_bid", "sold"]);
const TRUST = new Set(["official", "marketplace_api", "marketplace_completed_sales", "other"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseTime(value) {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeEvidence(record, nowMs, maxAgeHours) {
  const type = cleanText(record?.type).toLowerCase();
  const source = cleanText(record?.source);
  const sourceUrl = cleanText(record?.sourceUrl);
  const trust = cleanText(record?.trust).toLowerCase();
  const currency = cleanText(record?.currency || "USD").toUpperCase();
  const observedAtMs = parseTime(record?.observedAt);
  const amountUSD = money(record?.amount);
  const ageHours = observedAtMs == null ? null : Math.max(0, (nowMs - observedAtMs) / 3_600_000);
  const exactIdentityMatch = record?.exactIdentityMatch === true;

  const valid = TYPES.has(type)
    && source
    && sourceUrl
    && TRUST.has(trust)
    && currency === "USD"
    && amountUSD != null
    && observedAtMs != null
    && exactIdentityMatch;

  return {
    type,
    source,
    sourceUrl,
    trust,
    currency,
    amountUSD,
    observedAt: observedAtMs == null ? null : new Date(observedAtMs).toISOString(),
    ageHours,
    exactIdentityMatch,
    fresh: valid && ageHours <= maxAgeHours,
    valid,
  };
}

export function verifyCollectibleMarket(input, options = {}) {
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("Invalid verification clock");
  const maxAgeHours = Number.isFinite(Number(options.maxAgeHours)) ? Number(options.maxAgeHours) : 72;
  const minSoldSamples = Number.isFinite(Number(options.minSoldSamples)) ? Number(options.minSoldSamples) : 2;

  const identity = {
    brand: cleanText(input?.identity?.brand),
    series: cleanText(input?.identity?.series),
    item: cleanText(input?.identity?.item),
    condition: cleanText(input?.identity?.condition),
    edition: cleanText(input?.identity?.edition),
    identifier: cleanText(input?.identity?.identifier),
  };
  const identityComplete = Boolean(identity.brand && identity.series && identity.item && identity.condition);

  const evidence = Array.isArray(input?.evidence)
    ? input.evidence.map((record) => normalizeEvidence(record, nowMs, maxAgeHours))
    : [];
  const valid = evidence.filter((record) => record.valid);
  const fresh = valid.filter((record) => record.fresh);
  const sold = fresh.filter((record) => record.type === "sold" && record.trust === "marketplace_completed_sales");
  const asks = fresh.filter((record) => record.type === "active_ask");
  const bids = fresh.filter((record) => record.type === "highest_bid");
  const msrp = fresh.filter((record) => record.type === "msrp" && record.trust === "official");

  const soldPrices = sold.map((record) => record.amountUSD);
  const soldMedianUSD = median(soldPrices);
  const soldLowUSD = soldPrices.length ? Math.min(...soldPrices) : null;
  const soldHighUSD = soldPrices.length ? Math.max(...soldPrices) : null;
  const distinctSoldSources = new Set(sold.map((record) => record.source)).size;
  const corroborated = sold.length >= minSoldSamples && distinctSoldSources >= 1;

  let status = "RESEARCH_ONLY";
  let confidence = 0;
  const reasons = [];

  if (!identityComplete) reasons.push("Exact collectible identity is incomplete");
  if (!fresh.length) reasons.push("No fresh valid market evidence");
  if (!sold.length) reasons.push("No verified completed-sale evidence; asking prices do not establish resale value");

  if (identityComplete && sold.length) {
    confidence = 60;
    confidence += Math.min(20, sold.length * 5);
    if (distinctSoldSources >= 2) confidence += 10;
    if (msrp.length) confidence += 5;
    if (asks.length || bids.length) confidence += 5;
    confidence = Math.min(100, confidence);
    status = corroborated ? "VERIFIED" : "LOW_CONFIDENCE";
  } else if (identityComplete && (asks.length || bids.length || msrp.length)) {
    status = "CURRENT_MARKET_ONLY";
    confidence = 35;
  }

  return {
    schema: PRICE_VERIFICATION_SCHEMA,
    status,
    confidence,
    identity,
    identityComplete,
    maxAgeHours,
    evidenceCount: evidence.length,
    validEvidenceCount: valid.length,
    freshEvidenceCount: fresh.length,
    soldSampleCount: sold.length,
    distinctSoldSources,
    soldMedianUSD,
    soldLowUSD,
    soldHighUSD,
    currentLowestAskUSD: asks.length ? Math.min(...asks.map((record) => record.amountUSD)) : null,
    currentHighestBidUSD: bids.length ? Math.max(...bids.map((record) => record.amountUSD)) : null,
    officialMsrpUSD: msrp.length ? Math.min(...msrp.map((record) => record.amountUSD)) : null,
    canClaimResaleValue: status === "VERIFIED" || status === "LOW_CONFIDENCE",
    canClaimStrongResaleValue: status === "VERIFIED",
    reasons,
    evidence,
  };
}

export function assertVerifiedResaleMarket(result) {
  if (result?.schema !== PRICE_VERIFICATION_SCHEMA) throw new Error("Price verification schema missing or invalid");
  if (result.status !== "VERIFIED" || result.canClaimStrongResaleValue !== true) {
    throw new Error(`Collectible resale market is not verified: ${result?.status ?? "unknown"}`);
  }
  if (!Number.isFinite(result.soldMedianUSD) || result.soldMedianUSD <= 0 || result.soldSampleCount < 2) {
    throw new Error("Verified resale market requires completed-sale samples and a positive sold median");
  }
  return true;
}
