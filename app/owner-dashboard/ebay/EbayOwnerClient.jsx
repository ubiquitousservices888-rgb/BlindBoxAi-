"use client";

import { useState } from "react";

export default function EbayOwnerClient() {
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadStatus(token = activeCode || code.trim()) {
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner/ebay-connect", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to read eBay connection status.");
      setActiveCode(token);
      setStatus(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read eBay status.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!activeCode) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner/ebay-connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorizeUrl) throw new Error(data.error || "Unable to start eBay authorization.");
      window.location.assign(data.authorizeUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start eBay authorization.");
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!activeCode) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner/ebay-connect", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeCode}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to disconnect eBay.");
      setStatus({ configured: true, connected: false });
      setMessage("eBay seller-account research connection removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect eBay.");
    } finally {
      setBusy(false);
    }
  }

  if (!activeCode) {
    return (
      <form onSubmit={(event) => { event.preventDefault(); loadStatus(code.trim()); }} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <strong>Owner access code</strong>
          <input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} />
        </label>
        <button disabled={busy} style={{ padding: 13, fontWeight: 800 }}>{busy ? "Checking…" : "OPEN OWNER EBAY CONTROL"}</button>
        {message ? <p role="alert">{message}</p> : null}
      </form>
    );
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
        <strong>eBay seller research connection</strong>
        <p>{status?.connected ? "CONNECTED — read-only seller research scopes are stored server-side." : status?.configured === false ? "NOT CONFIGURED — production eBay OAuth settings are still required." : "NOT CONNECTED."}</p>
        {status?.connectedAt ? <p style={{ opacity: 0.75 }}>Connected: {new Date(status.connectedAt).toLocaleString()}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" onClick={connect} disabled={busy || status?.configured === false} style={{ padding: "11px 15px", fontWeight: 800 }}>
            {status?.connected ? "REAUTHORIZE EBAY" : "CONNECT MY EBAY"}
          </button>
          <button type="button" onClick={disconnect} disabled={busy || !status?.connected} style={{ padding: "11px 15px", fontWeight: 800 }}>
            DISCONNECT
          </button>
          <button type="button" onClick={() => loadStatus()} disabled={busy} style={{ padding: "11px 15px" }}>REFRESH</button>
        </div>
      </div>
      <p style={{ opacity: 0.75 }}>
        This connection is for research only. It does not create/edit listings, send buyer messages, issue refunds, change fulfillment, or transfer ownership.
        Reconnect, disconnect, or future scope changes stay behind this owner gate.
      </p>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
