const MONEY_HEADERS = ["earnings", "commission", "commissions", "partner earnings", "estimated earnings"];
const CLICK_HEADERS = ["clicks", "click count", "network clicks"];
const ORDER_HEADERS = ["transactions", "orders", "sales count", "quantity"];
const STATUS_HEADERS = ["status", "transaction status"];
const ID_HEADERS = ["partner network transaction id", "transaction id", "ebay checkout transaction id"];

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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

function columnIndex(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function numberValue(value) {
  const cleaned = String(value ?? "")
    .replace(/[$£€¥,]/g, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEpnReportCsv(csvText, { now = new Date() } = {}) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error("EPN report CSV must contain a header row and data rows");

  const headers = rows[0].map(normalizeHeader);
  const earningsIndex = columnIndex(headers, MONEY_HEADERS);
  const clicksIndex = columnIndex(headers, CLICK_HEADERS);
  const ordersIndex = columnIndex(headers, ORDER_HEADERS);
  const statusIndex = columnIndex(headers, STATUS_HEADERS);
  const idIndex = columnIndex(headers, ID_HEADERS);

  if (earningsIndex < 0) throw new Error("EPN report must include an Earnings or Commission column");

  let earnings = 0;
  let clicks = 0;
  let orders = 0;
  let acceptedRows = 0;
  const uniqueTransactions = new Set();

  for (const row of rows.slice(1)) {
    const status = statusIndex >= 0 ? normalizeHeader(row[statusIndex]) : "";
    if (status && status !== "approved" && status !== "confirmed") continue;

    const rowEarnings = numberValue(row[earningsIndex]);
    if (rowEarnings === null) continue;
    earnings += rowEarnings;
    acceptedRows += 1;

    if (clicksIndex >= 0) clicks += numberValue(row[clicksIndex]) ?? 0;
    if (ordersIndex >= 0) orders += numberValue(row[ordersIndex]) ?? 0;
    if (idIndex >= 0) {
      const id = String(row[idIndex] ?? "").trim();
      if (id) uniqueTransactions.add(id);
    }
  }

  if (idIndex >= 0 && uniqueTransactions.size) orders = uniqueTransactions.size;

  const roundedEarnings = Math.round((earnings + Number.EPSILON) * 100) / 100;
  const epc = clicks > 0 ? Math.round(((roundedEarnings / clicks) + Number.EPSILON) * 10000) / 10000 : null;
  const hasOrders = ordersIndex >= 0 || uniqueTransactions.size > 0;
  const hasClicks = clicksIndex >= 0;

  return {
    source: "ebay_partner_network_csv",
    status: hasClicks && hasOrders ? "Connected from EPN report" : "EPN report connected; some metrics unavailable in this report type",
    orders: hasOrders ? orders : null,
    earnings: roundedEarnings,
    epc,
    networkClicks: hasClicks ? clicks : null,
    acceptedRows,
    importedAt: now.toISOString(),
  };
}
