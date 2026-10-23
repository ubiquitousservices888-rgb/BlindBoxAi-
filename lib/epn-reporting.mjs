import { normalizeBlindBoxEpnCustomId } from "./campaign-attribution.mjs";

const TOTAL_EARNINGS_HEADERS = ["earnings", "total earnings", "commission", "commissions", "partner earnings", "estimated earnings"];
const ACTION_EARNINGS_HEADERS = ["action earnings"];
const CLICK_EARNINGS_HEADERS = ["click earnings"];
const MONEY_HEADERS = [...TOTAL_EARNINGS_HEADERS, ...ACTION_EARNINGS_HEADERS, ...CLICK_EARNINGS_HEADERS];
const CLICK_HEADERS = ["clicks", "click count", "network clicks"];
const ORDER_HEADERS = ["transactions", "transaction count", "orders", "sales count", "quantity", "qty"];
const STATUS_HEADERS = ["status", "transaction status"];
const ID_HEADERS = ["partner network transaction id", "transaction id", "ebay checkout transaction id"];
const DATE_HEADERS = ["date", "event date", "update date", "transaction date", "day"];
const CUSTOM_ID_HEADERS = ["custom id", "customid"];

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field); field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function aliasMatch(header, alias) {
  return header === alias || header.startsWith(`${alias} `) || header.startsWith(`${alias} -`);
}

function columnIndex(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases.some((alias) => aliasMatch(headers[index], alias))) return index;
  }
  return -1;
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const headers = rows[i].map(normalizeHeader);
    if (columnIndex(headers, MONEY_HEADERS) < 0) continue;
    // Report titles can mention "Action Earnings"; accept only real tabular headers.
    const structuralHeaders = [CLICK_HEADERS, ORDER_HEADERS, STATUS_HEADERS, ID_HEADERS, DATE_HEADERS, CUSTOM_ID_HEADERS];
    if (structuralHeaders.some((aliases) => columnIndex(headers, aliases) >= 0)) return i;
  }
  return -1;
}

function numberValue(value) {
  let cleaned = String(value ?? "").trim();
  // This importer emits USD. Never relabel another currency as dollars.
  if (/[£€¥]/.test(cleaned) || (cleaned.match(/\b[a-z]{3}\b/gi) || []).some((code) => code.toUpperCase() !== "USD")) return null;
  const negative = /^\(.*\)$/.test(cleaned);
  if (negative) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned
    .replace(/[$£€¥,]/g, "")
    .replace(/\b[A-Z]{3}\b/gi, "")
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function dateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function parseEpnReportCsv(csvText, { now = new Date() } = {}) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error("EPN report CSV must contain a header row and data rows");

  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) throw new Error("EPN report must include an Earnings or Commission column");

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const earningsIndex = columnIndex(headers, TOTAL_EARNINGS_HEADERS);
  const actionEarningsIndex = columnIndex(headers, ACTION_EARNINGS_HEADERS);
  const clickEarningsIndex = columnIndex(headers, CLICK_EARNINGS_HEADERS);
  const clicksIndex = columnIndex(headers, CLICK_HEADERS);
  const ordersIndex = columnIndex(headers, ORDER_HEADERS);
  const statusIndex = columnIndex(headers, STATUS_HEADERS);
  const idIndex = columnIndex(headers, ID_HEADERS);
  const dateIndex = columnIndex(headers, DATE_HEADERS);
  const customIdIndex = columnIndex(headers, CUSTOM_ID_HEADERS);
  const currencyIndex = columnIndex(headers, ["currency", "currency code"]);
  for (const index of [earningsIndex, actionEarningsIndex, clickEarningsIndex]) {
    const currency = index >= 0 ? String(rows[headerRowIndex][index]).match(/\(([A-Z]{3})\)/i)?.[1] : null;
    if (currency && currency.toUpperCase() !== "USD") throw new Error("Only USD commission reports are supported");
  }
  const reportType = idIndex >= 0 ? "transaction_detail" : "summary_only";
  const warnings = idIndex < 0 ? ["No transaction IDs present — export Transaction Detail report for revenue verification."] : [];

  // Identical exported lines cannot create additional revenue. Distinct item
  // lines on the same transaction still aggregate below.
  const seenRows = new Set();
  const reportRows = rows.slice(headerRowIndex + 1).filter((row) => {
    if (["total", "grand total", "totals"].includes(normalizeHeader(row[0]))) return false;
    const fingerprint = JSON.stringify(row.map((value) => String(value).trim()));
    if (seenRows.has(fingerprint)) return false;
    seenRows.add(fingerprint);
    return true;
  });
  // A transaction with conflicting attribution, adjustments, or lifecycle
  // states needs reconciliation. Do not import only its profitable lines.
  const identities = new Map();
  for (const row of reportRows) {
    const id = idIndex >= 0 ? String(row[idIndex] ?? "").trim() : "";
    if (!id) continue;
    const customId = customIdIndex >= 0 ? String(row[customIdIndex] ?? "").trim().toLowerCase() : "";
    const entry = identities.get(id) || { customIds: new Set(), relevant: false, blocked: false };
    entry.customIds.add(customId);
    entry.relevant ||= Boolean(normalizeBlindBoxEpnCustomId(customId));
    const status = statusIndex >= 0 ? normalizeHeader(row[statusIndex]) : "";
    entry.blocked ||= !["approved", "confirmed"].includes(status) ||
      (currencyIndex >= 0 && String(row[currencyIndex] ?? "").trim().toUpperCase() !== "USD") ||
      [earningsIndex, actionEarningsIndex, clickEarningsIndex].some((index) => index >= 0 && numberValue(row[index]) < 0);
    identities.set(id, entry);
  }
  const blockedTransactions = new Set([...identities].filter(([, entry]) =>
    entry.relevant && (entry.blocked || entry.customIds.size !== 1)).map(([id]) => id));
  if (blockedTransactions.size) warnings.push("Transaction adjustments or conflicting attribution require reconciliation; affected transactions are excluded. Historical conversion evidence is not reconciled by this import.");

  let earnings = 0;
  let revenueRowClicks = 0;
  let matchedClicks = 0;
  let orders = 0;
  let acceptedRows = 0;
  const buckets = {
    matched: { rows: 0, clicks: 0, transactions: 0, networkReportedCommissions: 0 },
    unmatched_confirmed: { rows: 0, clicks: 0, transactions: 0, networkReportedCommissions: 0 },
    pending: { rows: 0, clicks: 0, transactions: 0, networkReportedCommissions: 0 },
    reversed: { rows: 0, clicks: 0, transactions: 0, networkReportedCommissions: 0 },
  };
  const bucketIds = Object.fromEntries(Object.keys(buckets).map((key) => [key, new Set()]));
  let rowsParsed = 0;
  const matchedIds = new Set();
  const uniqueTransactions = new Set();
  const transactionEvidence = new Map();
  const daily = new Map();

  for (const row of reportRows) {
    rowsParsed += 1;
    if (currencyIndex >= 0 && String(row[currencyIndex] ?? "").trim().toUpperCase() !== "USD") continue;
    const status = statusIndex >= 0 ? normalizeHeader(row[statusIndex]) : "";
    const customId = customIdIndex >= 0 ? String(row[customIdIndex] ?? "").trim().toLowerCase() : "";
    const allowedCustomId = normalizeBlindBoxEpnCustomId(customId);
    // Status-less reports are not confirmed commissions.
    const confirmed = status === "approved" || status === "confirmed";
    const bucket = confirmed
      ? allowedCustomId ? "matched" : "unmatched_confirmed"
      : /^(reversed|reversal|refunded|cancelled|canceled|declined)$/.test(status) ? "reversed" : "pending";

    const reportedTotal = earningsIndex >= 0 ? numberValue(row[earningsIndex]) : null;
    const actionEarnings = actionEarningsIndex >= 0 ? numberValue(row[actionEarningsIndex]) : null;
    const clickEarnings = clickEarningsIndex >= 0 ? numberValue(row[clickEarningsIndex]) : null;
    // Prefer a network-provided total when present; otherwise sum the two earning types.
    // Never add the action/click components to an existing total (double counting).
    const hasComponentColumns = actionEarningsIndex >= 0 || clickEarningsIndex >= 0;
    // Blank numeric cells in a Custom ID report mean zero earnings, not zero clicks.
    // Reject nonblank malformed components rather than silently interpreting them as zero.
    const invalidComponents = [actionEarningsIndex, clickEarningsIndex].some((index) => {
      if (index < 0) return false;
      const value = String(row[index] ?? "").trim();
      return value !== "" && numberValue(value) === null;
    });
    const malformedTotal = earningsIndex >= 0 && String(row[earningsIndex] ?? "").trim() !== "" && reportedTotal === null;
    const rowEarnings = malformedTotal ? null : reportedTotal !== null ? reportedTotal
      : hasComponentColumns && !invalidComponents ? (actionEarnings ?? 0) + (clickEarnings ?? 0) : null;
    if (rowEarnings === null) continue;
    const rowClicks = clicksIndex >= 0 ? numberValue(row[clicksIndex]) ?? 0 : 0;
    const rowOrders = ordersIndex >= 0 ? numberValue(row[ordersIndex]) ?? 0 : 0;
    const group = buckets[bucket];
    group.rows += 1;
    group.clicks += rowClicks;
    group.transactions += rowOrders;
    group.networkReportedCommissions = Math.round((group.networkReportedCommissions + rowEarnings + Number.EPSILON) * 100) / 100;
    const bucketTransactionId = idIndex >= 0 ? String(row[idIndex] ?? "").trim() : "";
    if (bucketTransactionId) bucketIds[bucket].add(bucketTransactionId);
    // A matching click is not a commission.
    if (allowedCustomId && (confirmed || status === "")) { matchedIds.add(allowedCustomId); matchedClicks += Math.max(0, rowClicks); }
    if (!(bucket === "matched" && bucketTransactionId && rowEarnings > 0) || blockedTransactions.has(bucketTransactionId)) continue;
    earnings += rowEarnings;
    revenueRowClicks += rowClicks;
    orders += rowOrders;
    acceptedRows += 1;

    if (idIndex >= 0) {
      const id = String(row[idIndex] ?? "").trim();
      if (id) {
        uniqueTransactions.add(id);
        const existingEvidence = transactionEvidence.get(id) || {
          providerEvidenceId: id,
          customId: allowedCustomId,
          occurredAt: null,
          confirmedRevenueUSD: 0,
          status: "provider_confirmed",
        };
        existingEvidence.confirmedRevenueUSD += rowEarnings;
        const evidenceDate = dateIndex >= 0 ? dateValue(row[dateIndex]) : null;
        if (evidenceDate && !existingEvidence.occurredAt) {
          existingEvidence.occurredAt = `${evidenceDate}T00:00:00.000Z`;
        }
        transactionEvidence.set(id, existingEvidence);
      }
    }

    const date = dateIndex >= 0 ? dateValue(row[dateIndex]) : null;
    if (date) {
      const item = daily.get(date) || { date, clicks: 0, orders: 0, earnings: 0 };
      item.clicks += rowClicks;
      item.orders += rowOrders;
      item.earnings += rowEarnings;
      daily.set(date, item);
    }
  }

  if (!Object.values(buckets).some((bucket) => bucket.rows > 0)) throw new Error("EPN report contains no usable USD reporting rows");
  if (idIndex >= 0 && uniqueTransactions.size) orders = uniqueTransactions.size;
  for (const [key, ids] of Object.entries(bucketIds)) {
    if (ids.size) buckets[key].transactions = ids.size;
  }

  const roundedEarnings = Math.round((earnings + Number.EPSILON) * 100) / 100;
  const epc = matchedClicks > 0 ? Math.round(((roundedEarnings / matchedClicks) + Number.EPSILON) * 10000) / 10000 : null;
  const hasOrders = true;
  const hasClicks = clicksIndex >= 0;
  const dailyRows = [...daily.values()]
    .map((item) => ({ ...item, earnings: Math.round((item.earnings + Number.EPSILON) * 100) / 100, epc: item.clicks > 0 ? Math.round(((item.earnings / item.clicks) + Number.EPSILON) * 10000) / 10000 : null }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const evidence = [...transactionEvidence.values()]
    .map((item) => ({
      ...item,
      confirmedRevenueUSD: Math.round((item.confirmedRevenueUSD + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => a.providerEvidenceId.localeCompare(b.providerEvidenceId));

  return {
    source: "ebay_partner_network_csv",
    verificationVersion: 1,
    reconciliationRequired: blockedTransactions.size > 0,
    status: acceptedRows === 0 ? "EPN report imported; no confirmed BlindBoxAI attribution" : hasClicks && hasOrders ? "Connected from EPN report" : "EPN report connected; some metrics unavailable in this report type",
    orders: hasOrders ? orders : null,
    earnings: roundedEarnings,
    epc,
    networkClicks: hasClicks ? matchedClicks : null,
    revenueRowClicks,
    reportType,
    warning: warnings.join(" ") || null,
    acceptedRows,
    rowsParsed,
    buckets,
    matchedCustomIds: [...matchedIds].sort(),
    matchedClicks,
    importedAt: now.toISOString(),
    daily: dailyRows,
    evidence,
  };
}
