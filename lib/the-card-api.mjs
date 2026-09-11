const API_ORIGIN = "https://thecardapi.com";
const SALES_PATH = "/api/v1/market/sales";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 100;

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

export function cardApiConfigured(env = process.env) {
  return Boolean(clean(env.THE_CARD_API_KEY));
}

function normalizedTokens(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function cardApiTitleMatches(title, requiredTitleTerms = []) {
  const haystack = ` ${normalizedTokens(title)} `;
  const terms = Array.isArray(requiredTitleTerms) ? requiredTitleTerms.map(normalizedTokens).filter(Boolean) : [];
  return terms.length > 0 && terms.every((term) => haystack.includes(` ${term} `));
}

export function normalizeCardApiSale(record, target) {
  const amount = positiveNumber(record?.price);
  const sourceUrl = safeHttpsUrl(record?.listing_url);
  const soldAt = clean(record?.sold_at) || clean(record?.sale_date);
  const listingType = clean(record?.listing_type).toLowerCase();
  if (!amount || !sourceUrl || record?.price_confirmed !== true || !soldAt) return null;
  if (!new Set(["auction", "fixed_price", "best_offer"]).has(listingType)) return null;
  if (!cardApiTitleMatches(record?.title, target?.requiredTitleTerms)) return null;

  return {
    type: "sold",
    amount,
    currency: clean(record?.currency || "USD").toUpperCase(),
    source: `The Card API:${clean(record?.platform || "marketplace")}`,
    sourceUrl,
    trust: "marketplace_completed_sales",
    observedAt: soldAt,
    soldAt,
    identity: { ...target.identity },
    providerRecordId: clean(record?.id),
    listingType,
    title: clean(record?.title).slice(0, 300),
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
      headers: { "x-market-api-key": apiKey, accept: "application/json" },
    });
    if (!response.ok) return { status: `http_${response.status}`, records: [], error: "provider request failed" };
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const records = rows.map((row) => normalizeCardApiSale(row, target)).filter(Boolean);
    return { status: "ok", records, error: null, returnedCount: rows.length };
  } catch (error) {
    return { status: error?.name === "AbortError" ? "timeout" : "fetch_failed", records: [], error: "provider request failed" };
  } finally {
    clearTimeout(timeout);
  }
}
