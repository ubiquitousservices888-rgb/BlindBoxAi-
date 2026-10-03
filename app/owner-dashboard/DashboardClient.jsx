"use client";

import { useEffect, useRef, useState } from "react";
import { money, numberOrStatus } from "../../lib/revenue-status.mjs";
import ControlPanel from "./ControlPanel";

const REFRESH_INTERVAL_MS = 30_000;

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function epnEpcStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized || normalized.includes("not connected")) return "Not connected";
  return "Unavailable in this report";
}

function durationLabel(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  if (!totalSeconds) return "Duration unavailable";
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

export default function DashboardClient() {
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewQueueError, setReviewQueueError] = useState("");
  const [watchingReviewUrl, setWatchingReviewUrl] = useState("");
  const [approvedReviewUrls, setApprovedReviewUrls] = useState(() => new Set());
  const [approvingReviewUrl, setApprovingReviewUrl] = useState("");
  const [deletingReviewId, setDeletingReviewId] = useState("");
  const [epnBusy, setEpnBusy] = useState(false);
  const [epnMessage, setEpnMessage] = useState("");
  const seen = useRef(new Set());
  const snapshotRef = useRef(null);
  const etagRef = useRef("");
  const requestInFlight = useRef(false);
  const reviewQueueRequestInFlight = useRef(false);
  const reviewQueueRefreshPending = useRef(false);
  const epnFileInput = useRef(null);

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

  async function loadReviewQueue(token) {
    if (!token) return false;
    if (reviewQueueRequestInFlight.current) {
      reviewQueueRefreshPending.current = true;
      return false;
    }
    reviewQueueRequestInFlight.current = true;
    setReviewQueueError("");
    try {
      const response = await fetch("/api/owner/review-queue", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Review queue unavailable.");
      setReviewQueue(Array.isArray(data.items) ? data.items : []);
      return true;
    } catch (cause) {
      setReviewQueueError(cause instanceof Error ? cause.message : "Review queue unavailable.");
      return false;
    } finally {
      reviewQueueRequestInFlight.current = false;
      if (reviewQueueRefreshPending.current) {
        reviewQueueRefreshPending.current = false;
        void loadReviewQueue(token);
      }
    }
  }

  async function unlock(event) {
    event.preventDefault();
    const token = code.trim();
    etagRef.current = "";
    snapshotRef.current = null;
    seen.current = new Set();
    const loaded = await load(token, false);
    if (loaded) {
      setActiveCode(token);
      await loadReviewQueue(token);
    }
  }

  useEffect(() => {
    if (!activeCode || !snapshotRef.current) return undefined;
    const timer = setInterval(() => {
      load(activeCode, true);
      loadReviewQueue(activeCode);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeCode]);

  async function enableNotifications() {
    if (!("Notification" in window)) return setError("Browser notifications are not supported on this device/browser.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") setError("Browser notifications were not enabled.");
  }

  async function approveReviewVideo(videoUrl, researchRunId) {
    if (!activeCode || !videoUrl || !researchRunId || approvingReviewUrl || busy) return;
    setApprovingReviewUrl(videoUrl);
    setError("");
    try {
      const response = await fetch("/api/owner/approve-review", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ videoUrl, researchRunId, youtubeAudience: "not_made_for_kids" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to approve this review video.");
      setApprovedReviewUrls((previous) => new Set([...previous, videoUrl]));
      setReviewMessage("APPROVED + LAUNCH DISPATCHED — YouTube and TikTok will run automatically. YouTube audience: not made for kids.");
      etagRef.current = "";
      await Promise.all([load(activeCode, false), loadReviewQueue(activeCode)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to approve this review video.");
    } finally {
      setApprovingReviewUrl("");
    }
  }

  async function deleteReviewVideo(item) {
    if (!activeCode || !item?.researchRunId || deletingReviewId || busy) return;
    const label = item.title || item.researchRunId || "this video";
    const confirmed = window.confirm(`Delete "${label}" from review? This permanently removes the uploaded media file and removes it from the Blue approval queue.`);
    if (!confirmed) return;

    setDeletingReviewId(item.researchRunId);
    setError("");
    try {
      const response = await fetch("/api/owner/review-queue", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeCode}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ researchRunId: item.researchRunId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete this review video.");
      if (watchingReviewUrl === item.mediaUrl) setWatchingReviewUrl("");
      setReviewQueue((previous) => previous.filter((row) => row?.research_run_id !== item.researchRunId));
      setReviewMessage(`DELETED — "${label}" was removed from the review queue and review-media storage.`);
      await loadReviewQueue(activeCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this review video.");
    } finally {
      setDeletingReviewId("");
    }
  }

  function chooseEpnReport() {
    if (!epnBusy) epnFileInput.current?.click();
  }

  async function importEpnReport(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || epnBusy) return;
    setError("");
    setEpnMessage("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose the CSV version of your eBay Partner Network report.");
      return;
    }

    setEpnBusy(true);
    try {
      const form = new FormData();
      form.append("report", file);
      const response = await fetch("/api/owner/epn-report", { method: "POST", headers: { Authorization: `Bearer ${activeCode}` }, body: form, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to import EPN report.");
      setEpnMessage(`EPN connected from report: ${data.orders ?? "orders unavailable"} orders, ${money(data.earnings)} earnings, ${money(data.epc, epnEpcStatus(data.status))} EPC.`);
      etagRef.current = "";
      await load(activeCode, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import EPN report.");
    } finally {
      setEpnBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <form onSubmit={unlock} style={{ display: "grid", gap: 14, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 6 }}><strong>Owner access code</strong><input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} /></label>
        <button disabled={busy} style={{ padding: 13, fontWeight: 700 }}>{busy ? "Opening…" : "Open dashboard"}</button>
        {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      </form>
    );
  }

  const revenue = snapshot.revenue || {};
  const funnel = snapshot.funnel || {};
  const epn = revenue.epn || {};
  const amazon = revenue.amazon || {};
  const reviewNotifications = reviewQueue
    .filter((item) => item?.status === "ready_for_review" && item?.video_url)
    .map((item) => ({
      pathname: item.research_run_id,
      mediaUrl: item.video_url,
      title: item.title,
      createdAt: item.created_at,
      researchRunId: item.research_run_id,
      vertical: item.vertical,
      durationSeconds: Number(item.duration_seconds || 0),
      sizeBytes: Number(item.size_bytes || 0),
    }));

  return <div style={{ display: "grid", gap: 24 }}>
    <ControlPanel activeCode={activeCode} />
    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Owner video control</h2>
      <a href="/media-upload" style={{ display: "inline-block", padding: "15px 18px", border: 0, borderRadius: 10, background: "#facc15", color: "#111827", fontSize: 17, fontWeight: 800, textDecoration: "none" }}>
        OPEN SAFE VIDEO UPLOADER
      </a>
      <p style={{ opacity: 0.75, marginBottom: 0 }}>Every Supabase review-queue video waiting for owner approval is loaded here. Watch the finished video, then press the blue button once. That approval launches YouTube + TikTok automatically while keeping the protected publishing checks.</p>
      {reviewMessage ? <p role="status" style={{ fontWeight: 700 }}>{reviewMessage}</p> : null}
      {reviewQueueError ? <p role="alert" style={{ color: "crimson" }}>{reviewQueueError}</p> : null}

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <h3 style={{ marginBottom: 0 }}>Videos waiting for your review ({reviewNotifications.length})</h3>
        {reviewNotifications.length ? reviewNotifications.map((item) => {
          const approved = approvedReviewUrls.has(item.mediaUrl);
          const watching = watchingReviewUrl === item.mediaUrl;
          return (
            <article key={item.pathname} style={{ border: "1px solid currentColor", borderRadius: 12, padding: 12 }}>
              <strong>{item.title || item.message || "BlindBoxAI review video"}</strong>
              {item.researchRunId ? <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4 }}>{item.researchRunId}</div> : null}
              <div style={{ opacity: 0.7, marginTop: 4 }}>{when(item.createdAt)}</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>{durationLabel(item.durationSeconds)}{item.sizeBytes > 0 ? ` · ${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                <button type="button" onClick={() => setWatchingReviewUrl(watching ? "" : item.mediaUrl)} style={{ padding: "11px 15px", border: 0, borderRadius: 9, background: "#facc15", color: "#111827", fontWeight: 800 }}>
                  {watching ? "CLOSE VIDEO" : "WATCH VIDEO"}
                </button>
                <button type="button" onClick={() => approveReviewVideo(item.mediaUrl, item.researchRunId)} disabled={approved || approvingReviewUrl === item.mediaUrl || Boolean(approvingReviewUrl) || Boolean(deletingReviewId) || busy} style={{ padding: "11px 15px", border: 0, borderRadius: 9, background: approved ? "#64748b" : (approvingReviewUrl === item.mediaUrl ? "#64748b" : "#2563eb"), color: "white", fontWeight: 800 }}>
                  {approved ? "LAUNCH DISPATCHED" : approvingReviewUrl === item.mediaUrl ? "APPROVING + LAUNCHING…" : "BLUE APPROVE + LAUNCH"}
                </button>
                <button type="button" onClick={() => deleteReviewVideo(item)} disabled={Boolean(approvingReviewUrl) || Boolean(deletingReviewId) || busy} style={{ padding: "11px 15px", border: "1px solid #b91c1c", borderRadius: 9, background: deletingReviewId === item.researchRunId ? "#64748b" : "#b91c1c", color: "white", fontWeight: 800 }}>
                  {deletingReviewId === item.researchRunId ? "DELETING…" : "DELETE"}
                </button>
              </div>
              {watching ? <video src={item.mediaUrl} controls autoPlay playsInline preload="metadata" style={{ width: "100%", marginTop: 12, borderRadius: 10, background: "black" }} /> : null}
              <p style={{ marginBottom: 0, opacity: 0.75 }}>{approved ? "This exact video was approved and its YouTube + TikTok publishing runs were dispatched." : "Watch the full video first. BLUE APPROVE + LAUNCH confirms YouTube: not made for kids and starts YouTube + TikTok. DELETE permanently removes the uploaded review-media file and takes it out of this approval list."}</p>
            </article>
          );
        }) : <p>No videos are currently staged for review in the dashboard window.</p>}
      </div>
    </section>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <button onClick={() => Promise.all([load(activeCode, false), loadReviewQueue(activeCode)])} disabled={busy} style={{ padding: "10px 14px" }}>{busy ? "Refreshing…" : "Refresh now"}</button>
      <button onClick={enableNotifications} style={{ padding: "10px 14px" }}>Enable browser notifications</button>
    </div>

    <section>
      <h2>Verified funnel</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
        <Stat label="Page views" value={funnel.pageViews ?? 0} />
        <Stat label="Landing sources" value={funnel.landingSources ?? 0} />
        <Stat label="Questions" value={funnel.questions ?? 0} />
        <Stat label="Confirmed signups" value={funnel.confirmedSignups ?? 0} />
        <Stat label="Consented commerce intents" value={funnel.commerceIntentClicks ?? 0} />
        <Stat label="Qualified affiliate clicks" value={funnel.outboundClicks ?? 0} />
        <Stat label="Raw affiliate clicks" value={funnel.rawAffiliateClicks ?? snapshot.totals?.epnClicksLoaded ?? 0} />
        <Stat label="Confirmed conversions" value={funnel.providerConfirmedConversions ?? 0} />
        <Stat label="Confirmed revenue" value={money(funnel.confirmedRevenueUSD)} />
      </div>
      {funnel.zeroState ? <p style={{ opacity: 0.75 }}>{funnel.zeroState}</p> : null}
      <p style={{ opacity: 0.75 }}>Qualified affiliate clicks count only post-gate requests classified as human candidates. Legacy/pre-gate rows and bot, prefetch, or HEAD traffic are excluded. Page views and commerce intents remain consent-gated and should not be compared directly with raw affiliate-click records.</p>
    </section>

    <section>
      <h2>Revenue control room</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
        <Stat label="Clicks last 24h" value={snapshot.totals?.epnClicksLast24h ?? 0} />
        <Stat label="EPN orders" value={numberOrStatus(epn.orders)} />
        <Stat label="EPN earnings" value={money(epn.earnings)} />
        <Stat label="EPN EPC" value={money(epn.epc, epnEpcStatus(epn.status))} />
      </div>
      <p style={{ opacity: 0.75 }}>eBay EPN reporting: {epn.status || "Not connected"}. Amazon Associates: {amazon.status || "Affiliate links active; reporting pending approval"}. Unverified earnings are never displayed as $0.</p>
      <input ref={epnFileInput} type="file" accept=".csv,text/csv" onChange={importEpnReport} hidden />
      <button type="button" onClick={chooseEpnReport} disabled={epnBusy} style={{ padding: "11px 15px", fontWeight: 800 }}>{epnBusy ? "IMPORTING EPN REPORT…" : "IMPORT EPN REPORT CSV"}</button>
      <p style={{ opacity: 0.75, marginBottom: 0 }}>Best immediate report: EPN Reports → Performance by Day → CSV. The dashboard stores only summarized orders, earnings, clicks/EPC and import time in private storage; the raw CSV is not retained.</p>
      {epn.importedAt ? <p style={{ opacity: 0.75 }}>Last EPN import: {when(epn.importedAt)}{Number.isFinite(epn.networkClicks) ? ` · EPN-reported clicks: ${epn.networkClicks}` : ""}</p> : null}
      {epnMessage ? <p role="status" style={{ fontWeight: 700 }}>{epnMessage}</p> : null}
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
