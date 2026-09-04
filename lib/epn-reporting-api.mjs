const EPN_API_ORIGIN = "https://api.partner.ebay.com";
const DEFAULT_LOOKBACK_DAYS = 30;
const REQUEST_TIMEOUT_MS = 20_000;

function cleanSecret(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/[$£€¥,]/g, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundEpc(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function utcDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid EPN report date.");
  return date.toISOString().slice(0, 10);
}

export function epnReportingCredentials(env = process.env) {
  return {
    accountSid: cleanSecret(env.EPN_ACCOUNT_SID),
    authToken: cleanSecret(env.EPN_REPORTING_ACCESS_TOKEN || env.EPN_AUTH_TOKEN),
  };
}

export function epnApiConfigured(env = process.env) {
  const { accountSid, authToken } = epnReportingCredentials(env);
  return Boolean(accountSid && authToken);
}

export function epnReportingWindow(now = new Date(), lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 366) {
    throw new Error("EPN lookback must be between 1 and 366 days.");
  }
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) throw new Error("Invalid EPN report clock.");
  const start = new Date(end.getTime() - (lookbackDays - 1) * 24 * 60 * 60 * 1000);
  return { startDate: utcDateString(start), endDate: utcDateString(end) };
}

export function buildEpnPerformanceByDayUrl({ accountSid, startDate, endDate }) {
  const sid = cleanSecret(accountSid);
  if (!sid) throw new Error("EPN Account SID is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
    throw new Error("EPN report dates must use YYYY-MM-DD.");
  }

  const url = new URL(
    `/mediapartners/${encodeURIComponent(sid)}/reports/ebay_partner_perf_by_day.json`,
    EPN_API_ORIGIN,
  );
  url.searchParams.set("CAMPAIGN_ID", "0");
  url.searchParams.set("CHECKOUT_SITE", "0");
  url.searchParams.set("START_DATE", startDate);
  url.searchParams.set("END_DATE", endDate);
  return url.toString();
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.Records)) return payload.Records;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.Results)) return payload.Results;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function summarizeEpnPerformancePayload(payload, {
  now = new Date(),
  startDate = null,
  endDate = null,
} = {}) {
  const records = recordsFromPayload(payload);
  let networkClicks = 0;
  let orders = 0;
  let earnings = 0;

  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    networkClicks += finiteNumber(row.Clicks ?? row.clicks);
    orders += finiteNumber(row.Transactions ?? row.transactions ?? row.Orders ?? row.orders);
    earnings += finiteNumber(row.Earnings ?? row.earnings);
  }

  const roundedEarnings = roundMoney(earnings);
  const epc = networkClicks > 0 ? roundEpc(roundedEarnings / networkClicks) : 0;
  const refreshedAt = new Date(now).toISOString();

  return {
    source: "ebay_partner_network_api",
    status: "Connected to EPN API",
    orders,
    earnings: roundedEarnings,
    epc,
    networkClicks,
    acceptedRows: records.length,
    importedAt: refreshedAt,
    refreshedAt,
    period: startDate && endDate ? { startDate, endDate } : null,
  };
}

export async function fetchEpnPerformanceByDay({
  accountSid,
  authToken,
  now = new Date(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  fetchImpl = fetch,
} = {}) {
  const sid = cleanSecret(accountSid);
  const token = cleanSecret(authToken);
  if (!sid) throw new Error("EPN Account SID is not configured.");
  if (!token) throw new Error("EPN reporting access token is not configured.");
  if (typeof fetchImpl !== "function") throw new Error("EPN reporting fetch implementation is unavailable.");

  const { startDate, endDate } = epnReportingWindow(now, lookbackDays);
  const url = buildEpnPerformanceByDayUrl({ accountSid: sid, startDate, endDate });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`, "utf8").toString("base64")}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response?.ok) {
      const status = Number(response?.status) || 502;
      throw new Error(`EPN API request failed with HTTP ${status}.`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("EPN API returned an unreadable JSON response.");
    }

    return summarizeEpnPerformancePayload(payload, { now, startDate, endDate });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("EPN API request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
