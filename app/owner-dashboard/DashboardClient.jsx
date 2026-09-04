"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import { money, numberOrStatus } from "../../lib/revenue-status.mjs";

const REFRESH_INTERVAL_MS = 30_000;
const MOBILE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function safeName(name) {
  const base = String(name || "review-video.mp4")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
}

function videoTitle(name) {
  return String(name || "BlindBoxAI review video")
    .replace(/\.mp4$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "BlindBoxAI review video";
}

function readVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = setTimeout(() => {
      video.src = "";
      reject(new Error("Could not read video metadata after upload."));
    }, 30_000);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const metadata = {
        durationSeconds: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      video.src = "";
      if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 || metadata.width <= 0 || metadata.height <= 0) {
        reject(new Error("Uploaded MP4 has invalid duration or dimensions."));
        return;
      }
      resolve(metadata);
    };
    video.onerror = () => {
      clearTimeout(timer);
      video.src = "";
      reject(new Error("Browser could not open the uploaded MP4 for review."));
    };
    video.src = url;
  });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export default function DashboardClient() {
  const [code, setCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchMessage, setLaunchMessage] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewResult, setReviewResult] = useState(null);
  const [epnBusy, setEpnBusy] = useState(false);
  const [epnMessage, setEpnMessage] = useState("");
  const seen = useRef(new Set());
  const snapshotRef = useRef(null);
  const etagRef = useRef("");
  const requestInFlight = useRef(false);
  const reviewFileInput = useRef(null);
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

  async function approveAndLaunchAllReadyVideos() {
    if (!activeCode || launchBusy) return;
    setLaunchBusy(true);
    setLaunchMessage("");
    setError("");
    try {
      const response = await fetch("/api/owner/approve-launch", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to approve launch-ready videos.");

      if (data.status === "nothing_ready") {
        setLaunchMessage("Nothing is waiting for approval right now.");
      } else {
        setLaunchMessage(`Approved ${data.approvedRuns} launch-ready video run${data.approvedRuns === 1 ? "" : "s"}. Publishing will continue through the protected pipeline.`);
      }
      etagRef.current = "";
      await load(activeCode, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to approve launch-ready videos.");
    } finally {
      setLaunchBusy(false);
    }
  }

  function chooseReviewVideo() {
    if (!reviewBusy) reviewFileInput.current?.click();
  }

  async function uploadAndStageReview(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || reviewBusy) return;

    setError("");
    setReviewMessage("");
    setReviewResult(null);
    setReviewProgress(0);

    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("Yellow review accepts MP4 video files only.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_SIZE) {
      setError("Video must be larger than 0 bytes and no more than 100 MB.");
      return;
    }

    setReviewBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MOBILE_UPLOAD_TIMEOUT_MS);

    try {
      setReviewMessage("Uploading review copy…");
      const pathname = `media/review/${Date.now()}-${safeName(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/review-upload",
        clientPayload: JSON.stringify({ accessCode: activeCode }),
        multipart: file.size >= MULTIPART_THRESHOLD_BYTES,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setReviewProgress(Math.round(percentage)),
      });

      if (!blob?.url || !/^https:\/\//i.test(blob.url)) throw new Error("Vercel Blob did not return a public HTTPS review URL.");

      setReviewMessage("Running mechanical video checks…");
      const metadata = await readVideoMetadata(blob.url);
      const result = {
        url: blob.url,
        fileName: file.name,
        sizeBytes: file.size,
        ...metadata,
        state: "READY_FOR_REVIEW",
        approved: false,
        staged: false,
      };
      setReviewResult(result);

      setReviewMessage("Staging exact video behind the blue approval gate…");
      const stageResponse = await fetch("/api/owner/stage-review", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          videoUrl: blob.url,
          title: videoTitle(file.name),
          sizeBytes: file.size,
          durationSeconds: metadata.durationSeconds,
          width: metadata.width,
          height: metadata.height,
        }),
      });
      const stage = await stageResponse.json().catch(() => ({}));
      if (!stageResponse.ok) throw new Error(stage.error || "Unable to stage the uploaded video for owner review.");

      setReviewResult({ ...result, staged: true });
      setReviewMessage("READY FOR REVIEW — watch this exact video, then use the blue button if it passes your review.");
      etagRef.current = "";
      await load(activeCode, false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Review upload failed.";
      setError(/abort|aborted/i.test(message) ? "Review upload timed out. Keep the dashboard open and retry once." : message);
    } finally {
      clearTimeout(timeout);
      setReviewBusy(false);
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
      const response = await fetch("/api/owner/epn-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}` },
        body: form,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to import EPN report.");
      setEpnMessage(`EPN connected from report: ${data.orders ?? "orders unavailable"} orders, ${money(data.earnings)} earnings, ${money(data.epc)} EPC.`);
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
        <label style={{ display: "grid", gap: 6 }}>
          <strong>Owner access code</strong>
          <input type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required style={{ padding: 12, fontSize: 16 }} />
        </label>
        <button disabled={busy} style={{ padding: 13, fontWeight: 700 }}>{busy ? "Opening…" : "Open dashboard"}</button>
        {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
      </form>
    );
  }

  const revenue = snapshot.revenue || {};
  const epn = revenue.epn || {};
  const amazon = revenue.amazon || {};

  return <div style={{ display: "grid", gap: 24 }}>
    <section style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Owner video control</h2>
      <input ref={reviewFileInput} type="file" accept="video/mp4,.mp4" onChange={uploadAndStageReview} hidden />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, maxWidth: 900 }}>
        <button type="button" onClick={chooseReviewVideo} disabled={reviewBusy} style={{ padding: "15px 18px", border: 0, borderRadius: 10, background: reviewBusy ? "#a16207" : "#facc15", color: "#111827", fontSize: 17, fontWeight: 800, cursor: reviewBusy ? "wait" : "pointer" }}>
          {reviewBusy ? `UPLOADING & CHECKING ${reviewProgress}%` : "UPLOAD & REVIEW VIDEO"}
        </button>
        <button type="button" onClick={approveAndLaunchAllReadyVideos} disabled={launchBusy} style={{ padding: "15px 18px", border: 0, borderRadius: 10, background: launchBusy ? "#64748b" : "#2563eb", color: "white", fontSize: 17, fontWeight: 800, cursor: launchBusy ? "wait" : "pointer" }}>
          {launchBusy ? "APPROVING READY VIDEOS…" : "APPROVE & LAUNCH ALL READY VIDEOS"}
        </button>
      </div>
      <p style={{ opacity: 0.75, marginBottom: 0 }}>Yellow uploads and checks an MP4, then parks that exact file at READY_FOR_REVIEW. Watch it here. Blue is the only control that approves and releases ready videos through social-production.</p>
      {reviewMessage ? <p role="status" style={{ fontWeight: 700 }}>{reviewMessage}</p> : null}
      {launchMessage ? <p role="status" style={{ fontWeight: 700 }}>{launchMessage}</p> : null}

      {reviewResult?.url ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 720 }}>
          <div style={{ border: "1px solid currentColor", borderRadius: 12, padding: 12 }}>
            <strong>{reviewResult.staged ? "READY_FOR_REVIEW — NOT APPROVED" : "UPLOADED — STAGING NOT COMPLETE"}</strong>
            <video src={reviewResult.url} controls playsInline preload="metadata" style={{ width: "100%", marginTop: 10, borderRadius: 10, background: "black" }} />
            <div style={{ marginTop: 10, fontSize: 14 }}>{reviewResult.width}×{reviewResult.height} · {formatDuration(reviewResult.durationSeconds)} · {(reviewResult.sizeBytes / (1024 * 1024)).toFixed(1)} MB</div>
          </div>
          <div style={{ border: "1px solid currentColor", borderRadius: 12, padding: 12 }}>
            <strong>Review checklist before blue</strong>
            <ul style={{ marginBottom: 0 }}>
              <li>Mechanical QC passed: valid MP4, allowed size, readable duration and dimensions, HTTPS review URL.</li>
              <li>Watch the full video: real/approved visuals, clear audio, correct facts, clean pacing, no unwanted ad/outro or dead section.</li>
              <li>Confirm BlindBoxAI branding/CTA and required affiliate disclosure are appropriate for the post.</li>
              <li>If anything is wrong, do not press blue; upload the corrected video with yellow.</li>
            </ul>
          </div>
        </div>
      ) : null}
    </section>

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
      <input ref={epnFileInput} type="file" accept=".csv,text/csv" onChange={importEpnReport} hidden />
      <button type="button" onClick={chooseEpnReport} disabled={epnBusy} style={{ padding: "11px 15px", fontWeight: 800 }}>
        {epnBusy ? "IMPORTING EPN REPORT…" : "IMPORT EPN REPORT CSV"}
      </button>
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
  return (
    <div style={{ border: "1px solid currentColor", borderRadius: 10, padding: 14 }}>
      <div style={{ opacity: 0.7, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}
