"use client";

import { useEffect, useRef, useState } from "react";
import { money, numberOrStatus } from "../../lib/revenue-status.mjs";

const REFRESH_INTERVAL_MS = 30_000;

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function DashboardClient() {
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set());
  const snapshotRef = useRef(null);
  const etagRef = useRef("");
  const requestInFlight = useRef(false);

  async function load(token, announce = false) {
    if (!token || requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;
      const response = await fetch("/api/owner/dashboard", { headers, cache: "no-store" });
      if (response.status === 304) return true;
      if (!response.ok) {
        if (response.status === 401) {
          etagRef.current = "";
          snapshotRef.current = null;
          seen.current = new Set();
          setSnapshot(null);
          setActiveCode("");
        }
        throw new Error(response.status === 401 ? "Invalid owner code." : "Dashboard unavailable.");
      }
      const data = await response.json();
      if (announce && snapshotRef.current && "Notification" in window && Notification.permission === "granted") {
        const fresh = [];
        for (const item of data.epnClicks || []) {
          const key = `click:${item.pathname}`;
          if (!seen.current.has(key)) fresh.push({ type: "EPN click", text: `${item.figure || item.seriesName || "Affiliate link"} clicked` });
        }
        for (const item of data.notifications || []) {
          const key = `note:${item.pathname}`;
          if (!seen.current.has(key)) fresh.push({ type: "BlindBoxAI", text: item.message || item.event || "Workflow finished" });
        }
        fresh.slice(0, 3).forEach((item) => new Notification(item.type, { body: item.text }));
      }
      const nextSeen = new Set();
      (data.epnClicks || []).forEach((item) => nextSeen.add(`click:${item.pathname}`));
      (data.notifications || []).forEach((item) => nextSeen.add(`note:${item.pathname}`));
      seen.current = nextSeen;
      etagRef.current = response.headers.get("etag") || "";
      snapshotRef.current = data;
      setSnapshot(data);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard unavailable.");
      return false;
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function unlock(event) {
    event.preventDefault();
    const token = code.trim();
    etagRef.current = "";
    snapshotRef.current = null;
    seen.current = new Set();
    const loaded = await load(token, false);
    if (loaded) setActiveCode(token);
  }

  useEffect(() => {
    if (!activeCode || !snapshotRef.current) return undefined;
    const timer = setInterval(() => load(activeCode, true), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeCode]);

  async function enableNotifications() {
    if (!("Notification" in window)) return setError("Browser notifications are not supported on this device/browser.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") setError("Browser notifications were not enabled.");
  }

  if (!snapshot) {
    return <form onSubmit={unlock} style={{ display: "grid", gap: 14, maxWidth: 420 }}>
      <label style={{ display: "grid", gap: 6 }}><strong>Owner access code</strong><input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} /></label>
      <button disabled={busy} style={{ padding: 13, fontWeight: 700 }}>{busy ? "Opening…" : "Open dashboard"}</button>
      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
    </form>;
  }

  const revenue = snapshot.revenue || {};
  const epn = revenue.epn || {};
  const amazon = revenue.amazon || {};

  return <div style={{ display: "grid", gap: 24 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <button onClick={() => load(activeCode, false)} disabled={busy} style={{ padding: "10px 14px" }}>{busy ? "Refreshing…" : "Refresh now"}</button>
      <button onClick={enableNotifications} style={{ padding: "10px 14px" }}>Enable browser notifications</button>
    </div>

    <section>
      <h2>Revenue control room</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
        <Stat label="Clicks last 24h" value={snapshot.totals?.epnClicksLast24h ?? 0} />
        <Stat label="EPN orders" value={numberOrStatus(epn.orders)} />
        <Stat label="EPN earnings" value={money(epn.earnings)} />
        <Stat label="EPN EPC" value={money(epn.epc)} />
      </div>
      <p style={{ opacity: 0.75 }}>eBay EPN reporting: {epn.status || "Not connected"}. Amazon Associates: {amazon.status || "Affiliate links active; reporting pending approval"}. Unverified earnings are never displayed as $0.</p>
    </section>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
      <Stat label="EPN click records" value={snapshot.totals?.epnClicksLoaded ?? 0} />
      <Stat label="Finish notices" value={snapshot.totals?.notificationsLoaded ?? 0} />
    </section>

    <section><h2>Finished / ready notifications</h2>{snapshot.notifications?.length ? snapshot.notifications.map((item) => <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginBottom: 10 }}><strong>{item.message || item.event || "Workflow notification"}</strong><div style={{ opacity: 0.75, marginTop: 5 }}>{when(item.createdAt)}</div>{item.mediaUrl ? <div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{item.mediaUrl}</div> : null}</article>) : <p>No finish notifications in the current dashboard window.</p>}</section>

    <section><h2>Recent eBay EPN clicks</h2>{snapshot.epnClicks?.length ? snapshot.epnClicks.map((item) => <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginBottom: 10 }}><strong>{item.figure || "Affiliate link"}</strong><div>{item.seriesName || item.seriesSlug || ""}</div><div style={{ opacity: 0.75, marginTop: 5 }}>{when(item.clickedAt)} · {item.kind || "active"} · {item.placement || "unknown"}</div><div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 5, overflowWrap: "anywhere" }}>customid: {item.customId}</div></article>) : <p>No EPN clicks in the current dashboard window.</p>}</section>

    {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
    <p style={{ opacity: 0.65, fontSize: 13 }}>Auto-refresh: every 30 seconds. The dashboard scans {snapshot.window?.lookbackDays ?? 2} UTC dates and stores no IP address, email, cookie, referrer, or user-agent in affiliate click events.</p>
  </div>;
}

function Stat({ label, value }) {
  return <div style={{ border: "1px solid currentColor", borderRadius: 10, padding: 14 }}><div style={{ opacity: 0.7, fontSize: 13 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div></div>;
}
