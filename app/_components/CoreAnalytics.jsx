"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CONSENT_STORAGE_KEY = "blindboxai_consent_v1";

function analyticsAllowed() {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.analytics === true;
  } catch {
    return false;
  }
}

function safeLandingSource() {
  const params = new URLSearchParams(window.location.search);
  const utm = String(params.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  if (utm) return utm;
  try {
    if (document.referrer) return new URL(document.referrer).hostname.replace(/^www\./, "").slice(0, 80);
  } catch {}
  return "direct";
}

function captureFirstParty(event, payload = {}) {
  try {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function destinationKind(href) {
  if (href.includes("/api/out/ebay")) return "ebay_affiliate";
  if (href.includes("/api/out/offer")) return "marketplace_offer";
  if (href.includes("/tools/buy-or-pass")) return "buy_or_pass";
  if (href.includes("/series/")) return "series_detail";
  return "internal_cta";
}

export default function CoreAnalytics() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(analyticsAllowed());

    const onConsent = (event) => {
      setAllowed(event?.detail?.analytics === true);
    };

    window.addEventListener("blindboxai:consent", onConsent);
    return () => window.removeEventListener("blindboxai:consent", onConsent);
  }, []);

  useEffect(() => {
    if (!allowed || !pathname) return;
    const path = pathname.slice(0, 120);
    track("page_view", { path });
    captureFirstParty("page_view", { path });
  }, [allowed, pathname]);

  useEffect(() => {
    if (!allowed) return;
    const source = safeLandingSource();
    try {
      if (sessionStorage.getItem("bbai_landing_source_recorded") === "1") return;
      track("landing_session_source", { source });
      captureFirstParty("landing_session_source", { source, path: window.location.pathname });
      sessionStorage.setItem("bbai_landing_source_recorded", "1");
    } catch {
      track("landing_session_source", { source });
      captureFirstParty("landing_session_source", { source, path: window.location.pathname });
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;

    const onClick = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      const href = String(anchor.getAttribute("href") || "");
      if (!href.startsWith("/")) return;
      const destination = destinationKind(href);
      if (destination === "internal_cta" && !href.includes("shop") && !href.includes("buy")) return;
      track("commerce_intent_click", { destination, path: window.location.pathname.slice(0, 120) });
      captureFirstParty("commerce_intent_click", {
        destination,
        path: window.location.pathname.slice(0, 120),
      });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [allowed]);

  return null;
}
