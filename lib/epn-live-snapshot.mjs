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
  if (report.reportType !== "transaction_detail" || !Array.isArray(report.evidence) ||
      !Number.isInteger(report.providerTransactionsParsed) || report.providerTransactionsParsed < 1 ||
      report.detailRowsWithoutTransactionId > 0 || report.invalidFinancialRows > 0) {
    throw new Error("EPN report contains missing identities or malformed financial rows");
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
    providerTransactionsParsed: report.providerTransactionsParsed,
    eligibleTransactions: IDs.size,
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

// All four read states have explicit financial behavior. Only a confirmed
// absent live object may fall back to an owner-uploaded manual CSV report.
export function unavailableEpnLiveSnapshot(message = "Live EPN reporting unavailable") {
  return {
    verificationVersion: 1,
    source: "epn_authenticated_tdr_api",
    reportType: "transaction_detail",
    rollingWindowOnly: true,
    status: message,
    reconciliationRequired: true,
    historicalLedgerReconciled: false,
    providerPayoutVerified: false,
    orders: null, earnings: null, epc: null, networkClicks: null, matchedClicks: null,
    daily: [],
    warning: "Live EPN totals withheld until a valid, current provider report is available.",
  };
}

export function epnLiveSnapshotIsFresh(report, now = new Date()) {
  if (!report || typeof report !== "object" || Array.isArray(report) ||
      report.source !== "epn_authenticated_tdr_api" ||
      report.verificationVersion !== 1 || report.rollingWindowOnly !== true ||
      report.reportType !== "transaction_detail" ||
      typeof report.reconciliationRequired !== "boolean" ||
      report.providerPayoutVerified !== false ||
      report.historicalLedgerReconciled !== false) return false;
  const importedAt = new Date(String(report.importedAt || ""));
  if (!Number.isFinite(importedAt.getTime()) || !Number.isFinite(now.getTime())) return false;
  const age = now.getTime() - importedAt.getTime();
  return age >= 0 && age <= EPN_LIVE_STALE_AFTER_MS;
}

export function redactStaleEpnSnapshot(report, now = new Date()) {
  if (!epnLiveSnapshotIsFresh(report, now)) {
    return unavailableEpnLiveSnapshot("Live EPN report stale, malformed, or untrusted — earnings unavailable");
  }
  if (report.reconciliationRequired) {
    return {
      ...report,
      status: "EPN report requires historical reconciliation — earnings withheld",
      orders: null, earnings: null, epc: null, networkClicks: null, matchedClicks: null,
      daily: [],
      warning: "Pending, reversed, adjusted or conflicting transaction rows require review.",
    };
  }
  return report;
}

// Selected explicitly to avoid reviving historical commissions when a new
// authenticated read exists but is malformed or temporarily inaccessible.
export function selectEpnDashboardReport({ liveState, manualReport, now = new Date() } = {}) {
  if (liveState?.kind === "missing") return manualReport ?? null;
  if (liveState?.kind === "present") return redactStaleEpnSnapshot(liveState.report, now);
  return unavailableEpnLiveSnapshot("Live EPN snapshot unreadable — earnings withheld");
}
