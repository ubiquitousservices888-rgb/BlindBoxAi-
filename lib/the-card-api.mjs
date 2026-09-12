const API_ORIGIN = "https://thecardapi.com";
const SALES_PATH = "/api/v1/market/sales";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 100;
const COMPLETED_LISTING_TYPES = new Set(["auction", "fixed_price", "best_offer"]);
const GRADED_TITLE_PATTERN = /\b(?:psa|bgs|sgc|cgc)\s*(?:10|9(?:\.5)?|8(?:\.5)?|7(?:\.5)?)\b|\bgraded\b/i;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedTokens(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleHasPhrase(title, term) {
  const haystack = ` ${normalizedTokens(title)} `;
  const needle = normalizedTokens(term);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

export function cardApiTitleMatches(title, requiredTitleTerms = []) {
  const terms = Array.isArray(requiredTitleTerms) ? requiredTitleTerms.filter((term) => typeof term === "string" && term.trim()) : [];
  return terms.length > 0 && terms.every((term) => titleHasPhrase(title, term));
}

function aliasesMatch(title, requiredTitleAliases = []) {
  if (!Array.isArray(requiredTitleAliases)) return true;
  return requiredTitleAliases.every((group) => {
    const aliases = Array.isArray(group) ? group : [group];
    return aliases.filter((alias) => typeof alias === "string" && alias.trim()).some((alias) => titleHasPhrase(title, alias));
  });
}

function printRunMatches(title, printRunMax) {
  if (!Number.isInteger(printRunMax) || printRunMax <= 0) return true;
  const denominator = String(printRunMax).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:/\\s*${denominator}\\b|\\bof\\s+${denominator}\\b)`, "i").test(String(title ?? ""));
}

export function cardApiExactTargetMatches(title, target = {}) {
  if (!cardApiTitleMatches(title, target.requiredTitleTerms)) return false;
  if (!aliasesMatch(title, target.requiredTitleAliases)) return false;
  const identifier = clean(target?.identity?.identifier);
  if (identifier && !titleHasPhrase(title, identifier)) return false;
  if (!printRunMatches(title, target?.printRunMax)) return false;
  if (clean(target?.identity?.condition).toLowerCase() === "raw" && GRADED_TITLE_PATTERN.test(String(title ?? ""))) return false;
  return true;
}

export function normalizeCardApiSale(record, target) {
  const amount = positiveNumber(record?.price);
  const sourceUrl = safeHttpsUrl(record?.listing_url);
  const soldAt = clean(record?.sold_at) || clean(record?.sale_date);
  const listingType = clean(record?.listing_type).toLowerCase();
  const currency = clean(record?.currency).toUpperCase();
  const title = clean(record?.title);
  if (!amount || !sourceUrl || record?.price_confirmed !== true || !soldAt) return null;
  if (currency !== "USD") return null;
  if (!COMPLETED_LISTING_TYPES.has(listingType)) return null;
  if (!cardApiExactTargetMatches(title, target)) return null;

  return {
    type: "sold",
    amount,
    currency,
    source: `The Card API:${clean(record?.platform || "marketplace")}`,
    sourceUrl,
    trust: "marketplace_completed_sales",
    observedAt: soldAt,
    soldAt,
    providerRecordId: clean(record?.id),
    listingType,
    title: title.slice(0, 300),
    targetId: clean(target?.id),
    strictTargetMatch: true,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeCardApiSales(records, minimumSamples = 2) {
  const required = Math.max(2, Number.isFinite(Number(minimumSamples)) ? Math.floor(Number(minimumSamples)) : 2);
  const sales = Array.isArray(records)
    ? records.filter((record) => record?.type === "sold" && record?.currency === "USD" && record?.strictTargetMatch === true)
    : [];
  const prices = sales.map((record) => Number(record.amount)).filter((amount) => Number.isFinite(amount) && amount > 0);
  const status = prices.length >= required ? "VERIFIED" : prices.length ? "LOW_CONFIDENCE" : "RESEARCH_ONLY";
  return {
    status,
    soldSampleCount: prices.length,
    minimumConfirmedExactSales: required,
    soldMedianUSD: median(prices),
    soldLowUSD: prices.length ? Math.min(...prices) : null,
    soldHighUSD: prices.length ? Math.max(...prices) : null,
    canClaimCompletedSalePriceSummary: status === "VERIFIED",
    canClaimOtherTargetClaims: false,
  };
}

export async function fetchCardApiSales(target, options = {}) {
  const apiKey = clean(options.apiKey ?? process.env.THE_CARD_API_KEY);
  if (!apiKey) return { status: "not_configured", records: [], error: null };
  const query = clean(target?.query);
  if (query.length < 4) return { status: "invalid_target", records: [], error: "query is required" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const url = new URL(SALES_PATH, API_ORIGIN);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(Math.min(MAX_RESULTS, Math.max(1, Number(target?.limit) || 50))));
    url.searchParams.set("sort", "date_desc");
    if (clean(target?.dateFrom)) url.searchParams.set("date_from", clean(target.dateFrom));
    if (clean(target?.dateTo)) url.searchParams.set("date_to", clean(target.dateTo));
    if (Number.isInteger(target?.printRunMax)) url.searchParams.set("print_run_max", String(target.printRunMax));

    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { "x-market-api-key": apiKey, accept: "application/json" },
    });
    if (!response.ok) return { status: `http_${response.status}`, records: [], error: "provider request failed" };
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const normalized = rows.map((row) => normalizeCardApiSale(row, target)).filter(Boolean);
    const records = [...new Map(normalized.map((record) => [record.providerRecordId || record.sourceUrl, record])).values()];
    return { status: "ok", records, error: null, returnedCount: rows.length, acceptedCount: records.length };
  } catch (error) {
    return { status: error?.name === "AbortError" ? "timeout" : "fetch_failed", records: [], error: "provider request failed" };
  } finally {
    clearTimeout(timeout);
  }
}
