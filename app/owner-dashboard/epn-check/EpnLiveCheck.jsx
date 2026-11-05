"use client";

import { useState } from "react";

// Independent of Supabase telemetry and the owner earnings dashboard.
// Owner code is held only in component memory and used in the Authorization
// header; never saved in a URL, local storage, logs, or client analytics.
export default function EpnLiveCheck() {
  const [ownerCode, setOwnerCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  async function verify(event) {
    event.preventDefault();
    const code = ownerCode.trim();
    if (!code || checking) return;
    setChecking(true);
    setReport(null);
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/owner/epn-tdr", {
        method: "GET",
        headers: { Authorization: `Bearer ${code}` },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 401) {
        setError("Owner code rejected. Enter your private owner access code exactly as configured in your site settings. Do not share it.");
        return;
      }
      if (response.status === 503) {
        setError("eBay reporting configuration is incomplete or currency is not verified as USD.");
        return;
      }
      if (response.status === 502) {
        setError("Owner access passed, but the live eBay report could not be verified. Check the eBay Account SID and Reporting Auth Token privately.");
        return;
      }
      if (!response.ok) {
        setError("The eBay reporting check could not complete. The server returned an unexpected response.");
        return;
      }
      const data = await response.json().catch(() => null);
      if (data?.source !== "epn_authenticated_tdr_api" ||
          data?.reportType !== "transaction_detail" ||
          data?.persisted !== false ||
          data?.verifiedProviderPayout !== false ||
          typeof data?.reconciliationRequired !== "boolean") {
        setError("The server returned an unexpected report format. No commission is verified.");
        return;
      }
      setReport(data);
    } catch {
      setError("The reporting check could not reach the server. Please reload this page and retry.");
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }

  const blocked = report?.reconciliationRequired === true;
  const verifiedWindow = report?.reconciliationRequired === false;
  const money = value => typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "Unavailable";

  return (
    <section style={{ maxWidth: 570, margin: "22px 0", border: "1px solid currentColor", padding: 18, borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Test my live eBay affiliate connection</h2>
      <p>This checks eBay directly. It does not depend on the earnings dashboard and does not change sales, payouts, or stored reports.</p>
      <form onSubmit={verify} style={{ display: "grid", gap: 10 }}>
        <label htmlFor="epn-owner-code"><strong>Private owner access code</strong></label>
        <input id="epn-owner-code" type="password" autoComplete="off"
          value={ownerCode} onChange={event => setOwnerCode(event.target.value)}
          required style={{ padding: 12, minHeight: 44, fontSize: 16, width: "100%", boxSizing: "border-box" }}/>
        <button type="submit" disabled={checking} style={{
          background: "#1d4ed8", color: "white", padding: 14,
          fontWeight: 800, minHeight: 48, border: 0, borderRadius: 8,
        }}>{checking ? "Checking eBay..." : "VERIFY LIVE EBAY REPORT"}</button>
      </form>
      {error ? <p role="alert" style={{ color: "#b91c1c", fontWeight: 700, overflowWrap: "anywhere" }}>{error}</p> : null}
      {report ? <div role="status" style={{ marginTop: 16, overflowWrap: "anywhere" }}>
        <p><strong>Authenticated eBay transaction-detail report received.</strong></p>
        <p>Report period: {report.startDate} through {report.endDate}</p>
        <p>Approved BlindBoxAI transactions: {report.matchedApprovedTransactions ?? "Unavailable"}</p>
        <p>Pending rows: {report.pendingRows ?? "Unavailable"}</p>
        <p>Reversed rows: {report.reversedRows ?? "Unavailable"}</p>
        <p><strong>Eligible commissions in this report window:</strong>{" "}
          {verifiedWindow ? money(report.matchedApprovedEarningsUSD) : "Withheld pending historical reconciliation"}
        </p>
        <p>{blocked
          ? "The report contains pending, reversed or conflicting data requiring reconciliation. Do not treat these figures as final revenue."
          : "This is a rolling report window, not a lifetime revenue or payout confirmation."}</p>
        <p>Stored: No. Payout verified: No.</p>
      </div> : null}
    </section>
  );
}
