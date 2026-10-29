import { parseEpnReportCsv } from "./epn-reporting.mjs";

const TDR_ORIGIN = "https://api.partner.ebay.com";
const MAX_REPORT_BYTES = 5 * 1024 * 1024;
const MAX_DATE_SPAN_DAYS = 40;
const CSV_TYPES = new Set(["text/csv", "text/plain", "application/csv", "application/octet-stream", "application/vnd.ms-excel"]);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const day = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? day : null;
}

export function epnTdrDateRange(now = new Date(), daysBack = 35) {
  if (!Number.isInteger(daysBack) || daysBack < 1 || daysBack > MAX_DATE_SPAN_DAYS) {
    throw new Error("EPN date window is outside the permitted range");
  }
  const today = new Date(now);
  if (!Number.isFinite(today.getTime())) throw new Error("Invalid report date");
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

// This is EPN's published Transaction Detail Report endpoint, NOT the eBay Buy
// OAuth API. The SID is a required path identifier; never put the Auth Token\n// or SID:token credentials in URL userinfo, query parameters, or logs.
export function epnTdrUrl({ accountSid, startDate, endDate }) {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(String(accountSid || ""))) throw new Error("EPN Account SID is invalid");
  const start = validDate(startDate);
  const end = validDate(endDate);
  if (!start || !end || start > end || (end - start) / 86400000 > MAX_DATE_SPAN_DAYS) {
    throw new Error("Invalid EPN Transaction Detail Report date range");
  }
  const url = new URL(`/Mediapartners/${accountSid}/Reports/ebay_partner_transaction_detail.csv`, TDR_ORIGIN);
  url.search = new URLSearchParams({
    DATE_TYPE: "update_date",
    STATUS: "ALL",
    VERTICAL_CATEGORY: "0",
    CHECKOUT_SITE: "0",
    CAMPAIGN_EBAY: "0",
    START_DATE: startDate,
    END_DATE: endDate,
  }).toString();
  return url;
}

export async function fetchEpnTdrCsv({
  accountSid,
  authToken,
  startDate,
  endDate,
  fetchImpl = fetch,
} = {}) {
  const url = epnTdrUrl({ accountSid, startDate, endDate });
  if (!authToken || typeof authToken !== "string" || authToken.length > 2048 || /[\r\n]/.test(authToken)) {
    throw new Error("EPN reporting API credentials are unavailable");
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64");
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "text/csv",
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url.toString())) {
      throw new Error("EPN reporting API request was not a direct successful response");
    }
    const contentType = String(response.headers?.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (!CSV_TYPES.has(contentType)) throw new Error("EPN reporting API did not return CSV");
    const declared = response.headers?.get("content-length");
    if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > MAX_REPORT_BYTES)) {
      throw new Error("EPN reporting response exceeded the limit");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("EPN report body is unreadable");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let result = "";
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_REPORT_BYTES) throw new Error("EPN reporting response exceeded the limit");
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
    } finally {
      try { await reader.cancel(); } catch { /* consumed or unavailable */ }
    }
    if (!result.trim() || /^\s*</.test(result)) throw new Error("EPN returned an empty or non-CSV report");
    return result;
  } catch (error) {
    // Never propagate HTTP response bodies, provider URLs containing credentials,
    // or transport errors whose strings may include headers.
    if (error?.message && /^(?:EPN reporting API|EPN report body|EPN reporting response|EPN returned)/.test(error.message)) throw error;
    throw new Error("EPN reporting API request unavailable; no reporting evidence imported");
  }
}

// Read-only. No writes to Vercel Blob, Supabase, eBay, or an affiliate ledger.
// The owner dashboard's existing CSV importer remains a separate gated action.
export async function inspectEpnTdr({ accountSid, authToken, now = new Date(), daysBack = 35, fetchImpl = fetch } = {}) {
  const { startDate, endDate } = epnTdrDateRange(now, daysBack);
  const csv = await fetchEpnTdrCsv({ accountSid, authToken, startDate, endDate, fetchImpl });
  const report = parseEpnReportCsv(csv, { now });
  if (report.reportType !== "transaction_detail") throw new Error("EPN TDR response lacks transaction identity");
  return {
    source: "epn_authenticated_tdr_api",
    startDate,
    endDate,
    retrievedAt: now.toISOString(),
    reportType: report.reportType,
    rowsParsed: report.rowsParsed,
    matchedApprovedTransactions: report.evidence.length,
    matchedApprovedEarningsUSD: report.earnings,
    pendingRows: report.buckets.pending.rows,
    reversedRows: report.buckets.reversed.rows,
    unmatchedConfirmedRows: report.buckets.unmatched_confirmed.rows,
    reconciliationRequired: report.reconciliationRequired || report.buckets.reversed.rows > 0,
    persisted: false,
    verifiedProviderPayout: false,
  };
}
