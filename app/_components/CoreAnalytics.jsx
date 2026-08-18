"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function safe(value, max = 120) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9._:/-]/g, "").slice(0, max);
}

function attribution() {
  const params = new URLSearchParams(window.location.search);
  let source = safe(params.get("utm_source"), 80);
  const medium = safe(params.get("utm_medium"), 80);
  const campaign = safe(params.get("utm_campaign"), 120);
  const contentId = safe(params.get("utm_content"), 120);
  if (!source) {
    try { if (document.referrer) source = safe(new URL(document.referrer).hostname.replace(/^www\./, ""), 80); }
    catch {}
  }
  return { source: source || "direct", medium: medium || null, campaign: campaign || null, contentId: contentId || null };
}

function firstPartyEvent(event) {
  fetch("/api/funnel/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

export default function CoreAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const attrs = attribution();
    track("page_view", { path: pathname.slice(0, 120) });
    firstPartyEvent({ event: "page_view", path: pathname.slice(0, 120), ...attrs });
  }, [pathname]);

  useEffect(() => {
    const attrs = attribution();
    try {
      if (sessionStorage.getItem("bbai_landing_source_recorded") === "1") return;
      track("landing_session_source", { source: attrs.source });
      firstPartyEvent({ event: "landing_session_source", path: window.location.pathname.slice(0, 120), ...attrs });
      sessionStorage.setItem("bbai_landing_source_recorded", "1");
    } catch {
      track("landing_session_source", { source: attrs.source });
      firstPartyEvent({ event: "landing_session_source", path: window.location.pathname.slice(0, 120), ...attrs });
    }
  }, []);

  return null;
}
