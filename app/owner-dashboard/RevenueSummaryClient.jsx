"use client";

import { useEffect, useState } from "react";
import { money, numberOrStatus } from "../../lib/revenue-status.mjs";

const REFRESH_MS = 5 * 60 * 1000;
const UNAVAILABLE_IN_REPORT = "Unavailable in this report";

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function statusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized || normalized.includes("not connected")) return "Not connected";
  return UNAVAILABLE_IN_REPORT;
}

function metricNumber(value, status) {
  return numberOrStatus(value, statusLabel(status));
}

function metricMoney(value, status) {
  return money(value, statusLabel(status));
}

function sumRows(rows, provider) {
  const values = rows.map((row) => row[provider] || {});
  return {
    clicks: values.every((item) => item.clicks == null) ? null : values.reduce((total, item) => total + (Number(item.clicks) || 0), 0),
    orders: values.every((item) => item.orders == null) ? null : values.reduce((total, item) => total + (Number(item.orders) || 0), 0),
    earnings: values.every((item) => item.earnings == null) ? null : Math.round((values.reduce((total, item) => total + (Number(item.earnings) || 0), 0) + Number.EPSILON) * 100) / 100,
  };
}

function combineValues(...values) {
  return values.every((value) => typeof value === "number" && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function startOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function startOfLast7Days() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return date.toISOString().slice(0, 10);
}

function ProviderSummary({ title, data }) {
  return (
    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <Stat label="Clicks" value={metricNumber(data.clicks, data.status)} />
        <Stat label="Orders" value={metricNumber(data.orders, data.status)} />
        <Stat label="Confirmed earnings" value={metricMoney(data.earnings, data.status)} />
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return <div style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12 }}><div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div></div>;
}

export default function RevenueSummaryClient() {
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [epnFile, setEpnFile] = useState(null);
  const [amazonFile, setAmazonFile] = useState(null);
  const [message, setMessage] = useState("");

  async function load(token) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/dashboard", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? "Invalid owner code." : "Revenue dashboard unavailable.");
      setSnapshot(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revenue dashboard unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!snapshot || !code) return undefined;
    const timer = setInterval(() => load(code), REFRESH_MS);
    return () => clearInterval(timer);
  }, [snapshot, code]);

  async function unlock(event) {
    event.preventDefault();
    const token = code.trim();
    await load(token);
  }

  async function importReport(file, endpoint, label) {
    if (!file || !code) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("report", file);
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${code}` }, body: form, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Unable to import ${label} report.`);
      setMessage(`${label} report connected: ${numberOrStatus(data.orders)} orders, ${money(data.earnings)} confirmed earnings.`);
      await load(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to import ${label} report.`);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return <form onSubmit={unlock} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <label style={{ display: "grid", gap: 6 }}><strong>Owner access code</strong><input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} /></label>
      <button disabled={busy} style={{ padding: 13, fontWeight: 800 }}>{busy ? "Loading earnings…" : "Open earnings dashboard"}</button>
      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
    </form>;
  }

  const revenue = snapshot.revenue || {};
  const epn = revenue.epn || {};
  const amazon = revenue.amazon || {};
  const rows = snapshot.dailyRevenue || [];
  const today = rows[0] || { eBay: {}, amazon: {} };
  const weekEpn = sumRows(rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= new Date(`${startOfLast7Days()}T00:00:00`).getTime()), "eBay");
  const weekAmazon = sumRows(rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= new Date(`${startOfLast7Days()}T00:00:00`).getTime()), "amazon");
  const monthEpn = sumRows(rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= new Date(`${startOfMonth()}T00:00:00`).getTime()), "eBay");
  const monthAmazon = sumRows(rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= new Date(`${startOfMonth()}T00:00:00`).getTime()), "amazon");
  const reportEpn = { clicks: epn.networkClicks, orders: epn.orders, earnings: epn.earnings, status: epn.status };
  const reportAmazon = { clicks: amazon.networkClicks, orders: amazon.orders, earnings: amazon.earnings, status: amazon.status };
  const combinedToday = combineValues(today.eBay.earnings, today.amazon.earnings);
  const combinedWeek = combineValues(weekEpn.earnings, weekAmazon.earnings);
  const combinedMonth = combineValues(monthEpn.earnings, monthAmazon.earnings);
  const combinedReport = combineValues(epn.earnings, amazon.earnings);

  return <div style={{ display: "grid", gap: 18 }}>
    <section style={{ border: "2px solid currentColor", borderRadius: 14, padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Earnings at a glance</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Stat label="Today" value={money(combinedToday, UNAVAILABLE_IN_REPORT)} />
        <Stat label="Last 7 days" value={money(combinedWeek, UNAVAILABLE_IN_REPORT)} />
        <Stat label="This month" value={money(combinedMonth, UNAVAILABLE_IN_REPORT)} />
        <Stat label="Confirmed report period" value={money(combinedReport, UNAVAILABLE_IN_REPORT)} />
      </div>
      <p style={{ opacity: 0.75 }}>Confirmed earnings only. Missing data is shown as unavailable; a real reported zero remains $0. Combined totals are shown only when both networks have report values.</p>
    </section>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      <ProviderSummary title="eBay Partner Network" data={reportEpn} />
      <ProviderSummary title="Amazon Associates" data={reportAmazon} />
    </div>

    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Network status & payout timing</h3>
      <p><strong>eBay:</strong> {epn.status || "Not connected"}</p>
      <p style={{ opacity: 0.8 }}>{epn.payoutTiming}</p>
      <p><strong>Amazon:</strong> {amazon.status || "Not connected"}</p>
      <p style={{ opacity: 0.8 }}>{amazon.payoutTiming}</p>
      {epn.importedAt ? <p style={{ opacity: 0.7 }}>Last eBay report sync: {new Date(epn.importedAt).toLocaleString()}</p> : null}
      {amazon.importedAt ? <p style={{ opacity: 0.7 }}>Last Amazon report import: {new Date(amazon.importedAt).toLocaleString()}</p> : null}
    </section>

    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Connect report data</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}><strong>eBay EPN CSV</strong><input type="file" accept=".csv,text/csv" onChange={(event) => setEpnFile(event.target.files?.[0] || null)} /></label>
        <button type="button" disabled={!epnFile || busy} onClick={() => importReport(epnFile, "/api/owner/epn-report", "eBay EPN")}>Import eBay report</button>
        <label style={{ display: "grid", gap: 6 }}><strong>Amazon Associates CSV/TXT</strong><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => setAmazonFile(event.target.files?.[0] || null)} /></label>
        <button type="button" disabled={!amazonFile || busy} onClick={() => importReport(amazonFile, "/api/owner/amazon-report", "Amazon")}>Import Amazon report</button>
      </div>
      {message ? <p role="status" style={{ fontWeight: 700 }}>{message}</p> : null}
      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
    </section>

    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16, overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Daily confirmed earnings</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
        <thead><tr><th style={{ textAlign: "left", padding: 8 }}>Date</th><th style={{ textAlign: "right", padding: 8 }}>eBay clicks</th><th style={{ textAlign: "right", padding: 8 }}>eBay earnings</th><th style={{ textAlign: "right", padding: 8 }}>Amazon clicks</th><th style={{ textAlign: "right", padding: 8 }}>Amazon earnings</th><th style={{ textAlign: "right", padding: 8 }}>Total</th></tr></thead>
        <tbody>{rows.slice(0, 14).map((row) => {
          const eBay = row.eBay || {};
          const amazonRow = row.amazon || {};
          const total = combineValues(eBay.earnings, amazonRow.earnings);
          return <tr key={row.date}>
            <td style={{ padding: 8 }}>{fmtDate(row.date)}</td>
            <td style={{ padding: 8, textAlign: "right" }}>{numberOrStatus(eBay.clicks, UNAVAILABLE_IN_REPORT)}</td>
            <td style={{ padding: 8, textAlign: "right" }}>{money(eBay.earnings, UNAVAILABLE_IN_REPORT)}</td>
            <td style={{ padding: 8, textAlign: "right" }}>{numberOrStatus(amazonRow.clicks, UNAVAILABLE_IN_REPORT)}</td>
            <td style={{ padding: 8, textAlign: "right" }}>{money(amazonRow.earnings, UNAVAILABLE_IN_REPORT)}</td>
            <td style={{ padding: 8, textAlign: "right", fontWeight: 800 }}>{money(total, UNAVAILABLE_IN_REPORT)}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>

    <p style={{ opacity: 0.7, fontSize: 13 }}>Refreshes automatically every five minutes while this page is open. eBay reporting can lag after a qualifying purchase; Amazon's reports also have reporting delays. Network-reported figures remain the source of truth.</p>
  </div>;
}
