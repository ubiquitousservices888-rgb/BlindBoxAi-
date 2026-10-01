"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 10_000;

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

function actionState(item) {
  if (!item) return "not-run";
  if (["queued", "pending", "in_progress", "waiting", "requested"].includes(item.status)) return "active";
  if (item.conclusion === "success") return "success";
  if (item.conclusion === "skipped") return "skipped";
  if (item.conclusion) return "failed";
  return item.status || "not-run";
}

function providerLabel(provider) {
  if (provider === "ebay_epn" || provider === "ebay_epn_live") return "eBay EPN";
  if (provider === "amazon_associates") return "Amazon";
  return String(provider || "Affiliate");
}

export default function ControlPanel({ activeCode }) {
  const [actions, setActions] = useState(null);
  const [clicks, setClicks] = useState(null);
  const [error, setError] = useState("");
  const [blueBusy, setBlueBusy] = useState(false);
  const [blueDispatchPending, setBlueDispatchPending] = useState(false);
  const [blueMessage, setBlueMessage] = useState("");
  const [tick, setTick] = useState(0);
  const lastCounts = useRef({ ebayEpn: 0, amazonAssociates: 0 });
  const loadInFlight = useRef(false);
  const blueDispatchStartedAt = useRef(0);
  const [flash, setFlash] = useState({ ebayEpn: false, amazonAssociates: false });

  async function load() {
    if (!activeCode || loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const headers = { Authorization: `Bearer ${activeCode}` };
      const [actionResponse, clickResponse] = await Promise.all([
        fetch("/api/owner/actions-status", { headers, cache: "no-store" }),
        fetch("/api/owner/live-clicks", { headers, cache: "no-store" }),
      ]);
      const [actionData, clickData] = await Promise.all([
        actionResponse.json().catch(() => ({})),
        clickResponse.json().catch(() => ({})),
      ]);
      if (!actionResponse.ok) throw new Error(actionData.error || "GitHub Actions status unavailable.");
      if (!clickResponse.ok) throw new Error(clickData.error || "Live click telemetry unavailable.");

      const nextCounts = clickData.totals || {};
      const nextFlash = {
        ebayEpn: Number(nextCounts.ebayEpn || 0) > Number(lastCounts.current.ebayEpn || 0),
        amazonAssociates: Number(nextCounts.amazonAssociates || 0) > Number(lastCounts.current.amazonAssociates || 0),
      };
      lastCounts.current = {
        ebayEpn: Number(nextCounts.ebayEpn || 0),
        amazonAssociates: Number(nextCounts.amazonAssociates || 0),
      };
      setFlash(nextFlash);
      if (nextFlash.ebayEpn || nextFlash.amazonAssociates) {
        setTimeout(() => setFlash({ ebayEpn: false, amazonAssociates: false }), 1600);
      }
      setActions(actionData);
      setClicks(clickData);
      const latestBlue = Array.isArray(actionData?.items)
        ? actionData.items.find((item) => item.name === "Owner Blue live verify once")
        : null;
      const blueCreatedAt = Date.parse(latestBlue?.createdAt || "");
      if (
        blueDispatchStartedAt.current > 0
        && latestBlue?.event === "workflow_dispatch"
        && Number.isFinite(blueCreatedAt)
        && blueCreatedAt >= blueDispatchStartedAt.current - 1500
      ) {
        blueDispatchStartedAt.current = 0;
        setBlueDispatchPending(false);
      }
      setError("");
      setTick((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Control panel unavailable.");
    } finally {
      loadInFlight.current = false;
    }
  }

  useEffect(() => {
    if (!activeCode) return undefined;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [activeCode]);

  async function runBlueVerify() {
    if (!activeCode || blueBusy) return;
    setBlueBusy(true);
    setBlueDispatchPending(true);
    setBlueMessage("");
    setError("");
    try {
      const response = await fetch("/api/owner/blue-live-verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeCode}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to start Blue Live Verify.");
      blueDispatchStartedAt.current = Date.now();
      setBlueMessage("BLUE LIVE VERIFY STARTED — production owner flow is being tested. Publishing is not part of this verification.");
      setTimeout(() => void load(), 1200);
    } catch (cause) {
      setBlueDispatchPending(false);
      blueDispatchStartedAt.current = 0;
      setError(cause instanceof Error ? cause.message : "Unable to start Blue Live Verify.");
    } finally {
      setBlueBusy(false);
    }
  }

  const items = Array.isArray(actions?.items) ? actions.items : [];
  const blueRun = items.find((item) => item.name === "Owner Blue live verify once") || null;
  const blueState = actionState(blueRun);
  const blueActive = blueState === "active";
  const summary = actions?.summary || {};
  const totals = clicks?.totals || {};
  const recent = Array.isArray(clicks?.recent) ? clicks.recent : [];
  const clickPulse = useMemo(() => tick % 2 === 0, [tick]);

  return (
    <section className="control-room" aria-label="BlindBoxAI animated owner control panel">
      <style jsx>{`
        .control-room{position:relative;overflow:hidden;border:1px solid rgba(59,130,246,.55);border-radius:20px;padding:18px;background:linear-gradient(145deg,#020617 0%,#0f172a 60%,#0b1120 100%);color:#e2e8f0;box-shadow:0 18px 70px rgba(2,6,23,.22)}
        .control-room:before{content:"";position:absolute;inset:-80%;background:conic-gradient(from 0deg,transparent 0 35%,rgba(37,99,235,.17) 48%,transparent 61% 100%);animation:sweep 10s linear infinite;pointer-events:none}
        .inner{position:relative;z-index:1}.head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.head h2{margin:0;font-size:1.35rem}.online{font:800 .72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
        .orb{display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:8px;box-shadow:0 0 0 0 rgba(34,197,94,.7);animation:pulse 1.8s ease-out infinite}
        .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}.metric{position:relative;border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:13px;background:rgba(15,23,42,.72);transition:transform .25s ease,box-shadow .25s ease}.metric.flash{transform:translateY(-2px);box-shadow:0 0 0 1px #38bdf8,0 0 28px rgba(56,189,248,.35)}.label{font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}.value{font-size:1.7rem;font-weight:900;margin-top:5px}.sub{font-size:.72rem;color:#94a3b8;margin-top:3px}
        .blue{width:100%;border:1px solid rgba(147,197,253,.9);border-radius:14px;padding:15px 18px;background:linear-gradient(135deg,#1d4ed8,#2563eb 48%,#0ea5e9);color:white;font-weight:950;letter-spacing:.08em;box-shadow:0 0 30px rgba(37,99,235,.3);cursor:pointer;animation:blueGlow 2.2s ease-in-out infinite}.blue:disabled{cursor:not-allowed;opacity:.65;animation:none}.blue[data-active="true"]{background:linear-gradient(135deg,#075985,#0284c7,#06b6d4)}
        .workflow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:9px;margin-top:16px}.workflow{display:block;border:1px solid rgba(148,163,184,.18);border-radius:11px;padding:10px;background:rgba(2,6,23,.45);color:inherit;text-decoration:none;min-width:0}.workflow strong{display:block;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.state{display:flex;align-items:center;gap:7px;margin-top:7px;font:800 .68rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.dot{width:8px;height:8px;border-radius:50%;background:#64748b}.dot[data-state="success"]{background:#22c55e;box-shadow:0 0 9px rgba(34,197,94,.8)}.dot[data-state="active"]{background:#38bdf8;box-shadow:0 0 10px rgba(56,189,248,.9);animation:pulseDot 1s ease-in-out infinite}.dot[data-state="failed"]{background:#ef4444;box-shadow:0 0 9px rgba(239,68,68,.7)}.dot[data-state="skipped"]{background:#f59e0b}
        .feed{margin-top:16px;border-top:1px solid rgba(148,163,184,.16);padding-top:12px}.feed-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.feed-list{display:grid;gap:7px;margin-top:9px}.click{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(15,23,42,.55);font-size:.74rem}.provider{font-weight:900}.muted{color:#94a3b8}.statusline{margin:10px 0 0;font-size:.76rem;color:#bfdbfe}
        @keyframes sweep{to{transform:rotate(360deg)}}@keyframes pulse{70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}@keyframes blueGlow{0%,100%{box-shadow:0 0 22px rgba(37,99,235,.28)}50%{box-shadow:0 0 42px rgba(14,165,233,.48)}}@keyframes pulseDot{0%,100%{opacity:.55}50%{opacity:1}}
        @media (prefers-reduced-motion:reduce){.control-room:before,.orb,.blue,.dot[data-state="active"]{animation:none!important}.metric{transition:none}}
      `}</style>
      <div className="inner">
        <div className="head">
          <h2><span className="orb" />BlindBoxAI Live Control Room</h2>
          <div className="online">LIVE · 10 SEC REFRESH</div>
        </div>

        <div className="metrics">
          <div className={`metric ${flash.ebayEpn ? "flash" : ""}`}><div className="label">eBay EPN clicks</div><div className="value">{totals.ebayEpn ?? "—"}</div><div className="sub">last 24 hours</div></div>
          <div className={`metric ${flash.amazonAssociates ? "flash" : ""}`}><div className="label">Amazon clicks</div><div className="value">{totals.amazonAssociates ?? "—"}</div><div className="sub">last 24 hours</div></div>
          <div className="metric"><div className="label">Qualified human clicks</div><div className="value">{totals.qualifiedHuman ?? "—"}</div><div className="sub">affiliate funnel · 24h</div></div>
          <div className="metric"><div className="label">Actions green</div><div className="value">{summary.success ?? "—"}</div><div className="sub">{summary.failed ?? 0} failed · {summary.active ?? 0} active</div></div>
        </div>

        <button className="blue" data-active={blueActive || blueDispatchPending ? "true" : "false"} type="button" onClick={runBlueVerify} disabled={blueBusy || blueActive || blueDispatchPending || blueState === "success"}>
          {blueBusy ? "STARTING BLUE LIVE VERIFY…" : blueDispatchPending ? "BLUE LIVE VERIFY DISPATCHED…" : blueActive ? "BLUE LIVE VERIFY RUNNING…" : blueState === "success" ? "BLUE LIVE VERIFIED" : "BLUE LIVE VERIFY"}
        </button>
        <p className="statusline">Blue Live Verify checks production upload → owner queue → authorization boundary → cleanup. It does not publish, purchase, or contact anyone.</p>
        {blueMessage ? <p role="status" className="statusline">{blueMessage}</p> : null}
        {error ? <p role="alert" style={{ color: "#fca5a5", fontWeight: 800 }}>{error}</p> : null}

        <div className="workflow-grid">
          {items.map((item) => {
            const state = actionState(item);
            const body = <><strong title={item.name}>{item.name}</strong><div className="state"><span className="dot" data-state={state} />{state}</div></>;
            return item.url
              ? <a className="workflow" key={item.name} href={item.url} target="_blank" rel="noreferrer">{body}</a>
              : <div className="workflow" key={item.name}>{body}</div>;
          })}
        </div>

        <div className="feed">
          <div className="feed-head"><strong>Live affiliate click feed</strong><span className="muted">{clickPulse ? "●" : "○"} updated {when(clicks?.generatedAt)}</span></div>
          <div className="feed-list">
            {recent.slice(0, 8).map((item, index) => (
              <div className="click" key={item.id || `${item.provider}-${item.clickedAt}-${index}`}>
                <span className="provider">{providerLabel(item.provider)}</span>
                <span>{item.figure || item.seriesName || item.itemSlug || item.campaignId || "Affiliate click"}</span>
                <span className="muted">{when(item.clickedAt)}</span>
              </div>
            ))}
            {!recent.length ? <div className="click"><span className="muted">No affiliate clicks recorded in the last 24 hours.</span></div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
