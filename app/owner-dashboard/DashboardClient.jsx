"use client";

import { useEffect, useRef, useState } from "react";

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

  async function load(token, announce = false) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Invalid owner code." : "Dashboard unavailable.");
      const data = await response.json();

      if (announce && snapshot && "Notification" in window && Notification.permission === "granted") {
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
      setSnapshot(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard unavailable.");
    } finally {
      setBusy(false);
    }
  }

  function unlock(event) {
    event.preventDefault();
    const token = code.trim();
    setActiveCode(token);
    load(token, false);
  }

  useEffect(() => {
    if (!activeCode) return undefined;
    const timer = setInterval(() => load(activeCode, true), 15000);
    return () => clearInterval(timer);
  }, [activeCode]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("Browser notifications are not supported on this device/browser.");
      return;
    }
    await Notification.requestPermission();
  }

  if (!snapshot) {
    return (
      <form onSubmit={unlock} style={{ display: "grid", gap: 14, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <strong>Owner access code</strong>
          <input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} />
        </label>
        <button disabled={busy} style={{ padding: 13, fontWeight: 700 }}>{busy ? "Opening…" : "Open dashboard"}</button>
        {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      </form>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button onClick={() => load(activeCode, false)} disabled={busy} style={{ padding: "10px 14px" }}>{busy ? "Refreshing…" : "Refresh now"}</button>
        <button onClick={enableNotifications} style={{ padding: "10px 14px" }}>Enable browser notifications</button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="EPN clicks loaded" value={snapshot.totals?.epnClicksLoaded ?? 0} />
        <Stat label="Clicks last 24h" value={snapshot.totals?.epnClicksLast24h ?? 0} />
        <Stat label="Finish notices" value={snapshot.totals?.notificationsLoaded ?? 0} />
      </section>

      <section>
        <h2>Finished / ready notifications</h2>
        {snapshot.notifications?.length ? snapshot.notifications.map((item) => (
          <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <strong>{item.message || item.event || "Workflow notification"}</strong>
            <div style={{ opacity: 0.75, marginTop: 5 }}>{when(item.createdAt)}</div>
            {item.mediaUrl ? <div style={{ marginTop: 6, overflowWrap: "anywhere" }}>{item.mediaUrl}</div> : null}
          </article>
        )) : <p>No finish notifications yet.</p>}
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
        )) : <p>No EPN clicks logged yet.</p>}
      </section>

      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      <p style={{ opacity: 0.65, fontSize: 13 }}>Auto-refresh: every 15 seconds. No IP address, email, cookie, referrer, or user-agent is stored in affiliate click events.</p>
    </div>
  );
}

function Stat({ label, value }) {
  return <div style={{ border: "1px solid currentColor", borderRadius: 10, padding: 14 }}><div style={{ opacity: 0.7, fontSize: 13 }}>{label}</div><div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div></div>;
}
