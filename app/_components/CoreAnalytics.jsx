"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

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

  useEffect(() => {
    if (!pathname) return;
    track("page_view", { path: pathname.slice(0, 120) });
  }, [pathname]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("bbai_landing_source_recorded") === "1") return;
      track("landing_session_source", { source: safeLandingSource() });
      sessionStorage.setItem("bbai_landing_source_recorded", "1");
    } catch {
      track("landing_session_source", { source: safeLandingSource() });
    }
  }, []);

  return null;
}
