import { parseEpnReportCsv } from "./epn-reporting.mjs";

export const EPN_LIVE_SNAPSHOT_PATH = "owner/epn-live/latest.json";
export const EPN_LIVE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

// Pure, deterministic interpretation of one authenticated provider report.
// Never add new earnings to a previous snapshot. Replace the snapshot each run.
// This deliberately does NOT write the immutable provider_conversion_evidence table.
export function buildEpnLiveSnapshot(csv, { now = new Date(), startDate, endDate } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid EPN report timestamp");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || "")) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ""))) {
    throw new Error("EPN report period is required");
  }
  const report = parseEpnReportCsv(csv, { now });
  if (report.reportType !== "transaction_detail" || !Array.isArray(report.evidence)) {
    throw new Error("EPN report lacks individual transaction identities");
  }
  const IDs = new Set(report.evidence.map(item => item.providerEvidenceId));
  if (IDs.size !== report.evidence.length || IDs.has("") || IDs.has(null)) {
    throw new Error("EPN report contains ambiguous transaction identities");
  }
  // An adjustment within this window can invalidate previously imported immutable
  // evidence. Withhold financial totals rather than publishing a misleading number.
  const blocked = Boolean(report.reconciliationRequired) ||
    Number(report.buckets?.reversed?.rows || 0) > 0;
  const reason = blocked
    ? "Adjustments or conflicting transaction states require historical reconciliation. Amounts withheld."
    : "Authenticated EPN Transaction Detail Report; 35-day update window only. Not a payout statement.";
  return {
    verificationVersion: 1,
    source: "epn_authenticated_tdr_api",
    status: blocked ? "EPN report needs reconciliation" : "EPN report retrieved (rolling update window)",
    reportType: "transaction_detail",
    // These are NOT lifetime earnings and MUST NOT be added to any prior period.
    reportingWindowStart: startDate,
    reportingWindowEnd: endDate,
    rollingWindowOnly: true,
    importedAt: now.toISOString(),
    dataFrom: report.dataFrom ?? null,
    dataThrough: report.dataThrough ?? null,
    reconciliationRequired: blocked,
    historicalLedgerReconciled: false,
    providerPayoutVerified: false,
    providerTransactionsChecked: IDs.size,
    rowsParsed: report.rowsParsed,
    orders: blocked ? null : report.orders,
    earnings: blocked ? null : report.earnings,
    epc: blocked ? null : report.epc,
    networkClicks: blocked ? null : report.networkClicks,
    matchedClicks: blocked ? null : report.matchedClicks,
    daily: blocked ? [] : report.daily,
    warning: [reason, report.warning].filter(Boolean).join(" "),
    // Persist no raw CSV, transaction IDs, Custom IDs, names, or bearer tokens.
  };
}

export function epnLiveSnapshotIsFresh(report, now = new Date()) {
  if (report?.source !== "epn_authenticated_tdr_api" ||
      report?.verificationVersion !== 1 ||
      !report?.rollingWindowOnly) return false;
  const importedAt = new Date(String(report.importedAt || ""));
  if (!Number.isFinite(importedAt.getTime())) return false;
  const age = now.getTime() - importedAt.getTime();
  return age >= 0 && age <= EPN_LIVE_STALE_AFTER_MS;
}

export function redactStaleEpnSnapshot(report, now = new Date()) {
  if (epnLiveSnapshotIsFresh(report, now)) return report;
  if (report?.source !== "epn_authenticated_tdr_api") return report;
  return {
    ...report,
    status: "Live EPN report stale — current commissions unavailable",
    orders: null, earnings: null, epc: null, networkClicks: null, matchedClicks: null,
    daily: [],
    warning: "Live report is over 48 hours old or malformed. Refresh before using financial totals.",
  };
}
