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
    track("page_view", { path: pathname.slice(0, 120) });
  }, [allowed, pathname]);

  useEffect(() => {
    if (!allowed) return;
    try {
      if (sessionStorage.getItem("bbai_landing_source_recorded") === "1") return;
      track("landing_session_source", { source: safeLandingSource() });
      sessionStorage.setItem("bbai_landing_source_recorded", "1");
    } catch {
      track("landing_session_source", { source: safeLandingSource() });
    }
  }, [allowed]);

  return null;
}
