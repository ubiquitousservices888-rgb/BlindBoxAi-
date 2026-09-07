const MONEY_HEADERS = ["commission income", "earnings", "commission", "commissions"];
const CLICK_HEADERS = ["product link clicks", "clicks", "click count"];
const ORDER_HEADERS = ["total items ordered", "items ordered", "ordered items", "orders", "quantity", "qty"];
const DATE_HEADERS = ["date", "transaction date", "order date", "ordered date"];

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ");
}

function numberValue(value) {
  let cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const negative = /^\(.*\)$/.test(cleaned);
  if (negative) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/[$£€¥,]/g, "").replace(/\b[A-Z]{3}\b/gi, "").trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function dateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseDelimitedRows(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
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
  for (let i = 0; i < headers.length; i += 1) {
    if (aliases.some((alias) => headers[i] === alias || headers[i].startsWith(`${alias} `) || headers[i].startsWith(`${alias} -`))) return i;
  }
  return -1;
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const headers = rows[i].map(normalizeHeader);
    if (columnIndex(headers, MONEY_HEADERS) >= 0 && (columnIndex(headers, CLICK_HEADERS) >= 0 || columnIndex(headers, ORDER_HEADERS) >= 0)) return i;
  }
  return -1;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseAmazonAssociatesReport(text, { now = new Date() } = {}) {
  const rows = parseDelimitedRows(text);
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) throw new Error("Amazon report must include earnings/commission plus clicks or orders columns.");

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const earningsIndex = columnIndex(headers, MONEY_HEADERS);
  const clicksIndex = columnIndex(headers, CLICK_HEADERS);
  const ordersIndex = columnIndex(headers, ORDER_HEADERS);
  const dateIndex = columnIndex(headers, DATE_HEADERS);

  let earnings = 0;
  let clicks = 0;
  let orders = 0;
  let acceptedRows = 0;
  const daily = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const label = normalizeHeader(row[0]);
    if (["total", "grand total", "totals", "summary"].includes(label)) continue;

    const rowEarnings = numberValue(row[earningsIndex]);
    const rowClicks = clicksIndex >= 0 ? numberValue(row[clicksIndex]) : 0;
    const rowOrders = ordersIndex >= 0 ? numberValue(row[ordersIndex]) : 0;
    if (rowEarnings === null && rowClicks === null && rowOrders === null) continue;

    earnings += rowEarnings ?? 0;
    clicks += rowClicks ?? 0;
    orders += rowOrders ?? 0;
    acceptedRows += 1;

    const date = dateIndex >= 0 ? dateValue(row[dateIndex]) : null;
    if (date) {
      const item = daily.get(date) || { date, clicks: 0, orders: 0, earnings: 0 };
      item.clicks += rowClicks ?? 0;
      item.orders += rowOrders ?? 0;
      item.earnings += rowEarnings ?? 0;
      daily.set(date, item);
    }
  }

  if (!acceptedRows) throw new Error("Amazon report contains no usable rows.");

  const roundedEarnings = roundMoney(earnings);
  const epc = clicks > 0 ? roundMoney(roundedEarnings / clicks) : null;
  const normalizedDaily = [...daily.values()]
    .map((item) => ({ ...item, earnings: roundMoney(item.earnings), epc: item.clicks > 0 ? roundMoney(item.earnings / item.clicks) : null }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    source: "amazon_associates_report",
    status: "Connected from Amazon Associates report",
    orders,
    earnings: roundedEarnings,
    epc,
    networkClicks: clicks,
    acceptedRows,
    importedAt: new Date(now).toISOString(),
    daily: normalizedDaily,
  };
}
