"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_INTERVAL_MS = 30_000;
const RANGE_OPTIONS = [1, 2, 7, 30];

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function pct(value) {
  return value == null ? "—" : `${value}%`;
}

function usd(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function DashboardClient() {
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [evidence, setEvidence] = useState({ providerEvidenceId: "", customId: "", occurredAt: "", confirmedRevenueUSD: "" });
  const [evidenceStatus, setEvidenceStatus] = useState("");
  const seen = useRef(new Set());
  const snapshotRef = useRef(null);
  const etagRef = useRef("");
  const requestInFlight = useRef(false);

  async function load(token, announce = false, requestedDays = days) {
    if (!token || requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;
      const response = await fetch(`/api/owner/dashboard?days=${requestedDays}`, { headers, cache: "no-store" });
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
        for (const item of data.funnel?.conversions || []) {
          const key = `conversion:${item.provider}:${item.providerEvidenceId}`;
          if (!seen.current.has(key)) fresh.push({ type: "Verified conversion", text: `${item.customId} · ${usd(item.confirmedRevenueUSD)}` });
        }
        fresh.slice(0, 3).forEach((item) => new Notification(item.type, { body: item.text }));
      }
      const nextSeen = new Set();
      (data.epnClicks || []).forEach((item) => nextSeen.add(`click:${item.pathname}`));
      (data.funnel?.conversions || []).forEach((item) => nextSeen.add(`conversion:${item.provider}:${item.providerEvidenceId}`));
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
    const loaded = await load(token, false, days);
    if (loaded) setActiveCode(token);
  }

  async function changeRange(value) {
    setDays(value);
    etagRef.current = "";
    if (activeCode) await load(activeCode, false, value);
  }

  useEffect(() => {
    if (!activeCode || !snapshotRef.current) return undefined;
    const timer = setInterval(() => load(activeCode, true, days), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeCode, days]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("Browser notifications are not supported on this device/browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") setError("Browser notifications were not enabled.");
  }

  async function recordConversion(event) {
    event.preventDefault();
    setEvidenceStatus("Recording verified provider evidence…");
    try {
      const response = await fetch("/api/owner/conversions", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(evidence),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Conversion evidence was not accepted.");
      setEvidence({ providerEvidenceId: "", customId: "", occurredAt: "", confirmedRevenueUSD: "" });
      setEvidenceStatus("Provider-confirmed evidence recorded. This is now eligible for verified conversion/revenue totals.");
      etagRef.current = "";
      await load(activeCode, false, days);
    } catch (cause) {
      setEvidenceStatus(cause instanceof Error ? cause.message : "Conversion evidence was not accepted.");
    }
  }

  if (!snapshot) {
    return (
      <form onSubmit={unlock} style={{ display: "grid", gap: 14, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 6 }}><strong>Owner dashboard code</strong>
          <input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} />
        </label>
        <button disabled={busy} style={{ padding: 13, fontWeight: 700 }}>{busy ? "Opening…" : "Open verified dashboard"}</button>
        {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      </form>
    );
  }

  const funnel = snapshot.funnel || {};
  const rates = funnel.rates || {};
  const breakdowns = funnel.breakdowns || {};

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section style={{ border: "2px solid currentColor", borderRadius: 12, padding: 14 }}>
        <strong>Evidence mode: production truth only</strong>
        <p style={{ marginTop: 6 }}>Test/demo data is excluded. An outbound click is never a conversion. Revenue appears only after provider-confirmed evidence is recorded.</p>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button onClick={() => load(activeCode, false, days)} disabled={busy} style={{ padding: "10px 14px" }}>{busy ? "Refreshing…" : "Refresh now"}</button>
        <button onClick={enableNotifications} style={{ padding: "10px 14px" }}>Enable notifications</button>
        <span style={{ marginLeft: 4 }}>Range:</span>
        {RANGE_OPTIONS.map((value) => <button key={value} onClick={() => changeRange(value)} disabled={busy} aria-pressed={days === value} style={{ padding: "8px 11px", fontWeight: days === value ? 800 : 400 }}>{value}d</button>)}
      </div>

      <section>
        <h2>Verified funnel · last {snapshot.window?.lookbackDays ?? days} day(s)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 12 }}>
          <Stat label="Page views" value={funnel.pageViews ?? 0} />
          <Stat label="Sources observed" value={funnel.landingSources ?? 0} />
          <Stat label="Questions" value={funnel.questions ?? 0} />
          <Stat label="Confirmed signups" value={funnel.signups ?? 0} />
          <Stat label="EPN outbound clicks" value={funnel.outboundClicks ?? 0} />
          <Stat label="Provider-confirmed conversions" value={funnel.providerConfirmedConversions ?? 0} />
          <Stat label="Confirmed revenue" value={usd(funnel.confirmedRevenueUSD)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 12 }}>
          <Stat label="Clicks / views" value={pct(rates.clicksPerViewPct)} small />
          <Stat label="Signups / views" value={pct(rates.signupsPerViewPct)} small />
          <Stat label="Confirmed conversions / clicks" value={pct(rates.confirmedConversionsPerClickPct)} small />
        </div>
        {(funnel.providerConfirmedConversions ?? 0) === 0 ? <p style={{ marginTop: 14, fontWeight: 800 }}>No verified conversions yet.</p> : null}
      </section>

      <Breakdown title="Traffic sources" rows={breakdowns.sources} />
      <Breakdown title="Campaigns / content IDs" rows={breakdowns.campaigns} />
      <Breakdown title="Affiliate clicks by series" rows={breakdowns.clickSeries} />
      <Breakdown title="Affiliate clicks by figure" rows={breakdowns.clickFigures} />

      <section>
        <h2>Provider-confirmed conversions</h2>
        {funnel.conversions?.length ? funnel.conversions.map((item) => (
          <article key={`${item.provider}:${item.providerEvidenceId}`} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <strong>{usd(item.confirmedRevenueUSD)} confirmed revenue</strong>
            <div>{item.provider} · {item.status} · {when(item.occurredAt)}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere" }}>evidence: {item.providerEvidenceId}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere" }}>customid: {item.customId}</div>
          </article>
        )) : <p>No verified conversions yet. Do not infer a sale from an outbound click.</p>}
      </section>

      <section style={{ borderTop: "1px solid currentColor", paddingTop: 20 }}>
        <h2>Record real EPN conversion evidence</h2>
        <p>Use this only after the transaction/conversion is visible in your EPN reporting. Copy the provider evidence/transaction ID, matching BlindBoxAI customid, provider timestamp, and confirmed commission/revenue amount exactly. Do not enter estimates or test data.</p>
        <form onSubmit={recordConversion} style={{ display: "grid", gap: 10, maxWidth: 620, marginTop: 12 }}>
          <Field label="EPN provider evidence / transaction ID" value={evidence.providerEvidenceId} onChange={(value) => setEvidence({ ...evidence, providerEvidenceId: value })} />
          <Field label="Matching BlindBoxAI customid" value={evidence.customId} onChange={(value) => setEvidence({ ...evidence, customId: value })} />
          <label style={{ display: "grid", gap: 5 }}><strong>Provider transaction timestamp</strong><input type="datetime-local" required value={evidence.occurredAt} onChange={(event) => setEvidence({ ...evidence, occurredAt: event.target.value })} style={{ padding: 10 }} /></label>
          <label style={{ display: "grid", gap: 5 }}><strong>Confirmed revenue / commission USD</strong><input type="number" min="0" step="0.01" required value={evidence.confirmedRevenueUSD} onChange={(event) => setEvidence({ ...evidence, confirmedRevenueUSD: event.target.value })} style={{ padding: 10 }} /></label>
          <button type="submit" style={{ padding: 12, fontWeight: 800 }}>Record provider-confirmed evidence</button>
          {evidenceStatus ? <p role="status">{evidenceStatus}</p> : null}
        </form>
      </section>

      <section>
        <h2>Recent eBay EPN clicks</h2>
        {snapshot.epnClicks?.length ? snapshot.epnClicks.map((item) => (
          <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <strong>{item.figure || "Affiliate link"}</strong>
            <div>{item.seriesName || item.seriesSlug || ""}</div>
            <div style={{ opacity: 0.75, marginTop: 5 }}>{when(item.clickedAt)} · {item.kind || "active"} · {item.placement || "unknown"}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 5, overflowWrap: "anywhere" }}>customid: {item.customId}</div>
          </article>
        )) : <p>No EPN clicks in the selected dashboard window.</p>}
      </section>

      <section>
        <h2>Finished / ready notifications</h2>
        {snapshot.notifications?.length ? snapshot.notifications.map((item) => (
          <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <strong>{item.message || item.event || "Workflow notification"}</strong>
            <div style={{ opacity: 0.75, marginTop: 5 }}>{when(item.createdAt)}</div>
          </article>
        )) : <p>No finish notifications in the selected window.</p>}
      </section>

      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      <p style={{ opacity: 0.65, fontSize: 13 }}>Auto-refresh: every 30 seconds. Private responses use no-store caching. Funnel events store no email, IP address, cookie, referrer URL path, or user-agent. First-party funnel collection begins when this release is deployed; older affiliate-click records remain visible as observed clicks.</p>
    </div>
  );
}

function Stat({ label, value, small = false }) {
  return <div style={{ border: "1px solid currentColor", borderRadius: 10, padding: 14 }}><div style={{ opacity: 0.7, fontSize: 13 }}>{label}</div><div style={{ fontSize: small ? 24 : 30, fontWeight: 800 }}>{value}</div></div>;
}

function Breakdown({ title, rows = [] }) {
  return <section><h2>{title}</h2>{rows.length ? <div style={{ display: "grid", gap: 6, marginTop: 10 }}>{rows.slice(0, 12).map((row) => <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "1px solid currentColor", padding: "7px 0" }}><span style={{ overflowWrap: "anywhere" }}>{row.key}</span><strong>{row.count}</strong></div>)}</div> : <p>No observed data in this range.</p>}</section>;
}

function Field({ label, value, onChange }) {
  return <label style={{ display: "grid", gap: 5 }}><strong>{label}</strong><input required value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" style={{ padding: 10 }} /></label>;
}
