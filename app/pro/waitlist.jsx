"use client";
import { track } from "@vercel/analytics";
import { useState } from "react";

import {
  normalizeAttributionSource,
  normalizeCampaignId,
  normalizeSource,
} from "../../lib/campaign-attribution.mjs";

const CAMPAIGN_STORAGE_KEY = "bbai_campaign";
const CAMPAIGN_SOURCE_STORAGE_KEY = "bbai_campaign_source";
const UTM_SOURCE_STORAGE_KEY = "bbai_utm_source";
const UTM_MEDIUM_STORAGE_KEY = "bbai_utm_medium";
const UTM_CAMPAIGN_STORAGE_KEY = "bbai_utm_campaign";
const UTM_CONTENT_STORAGE_KEY = "bbai_utm_content";

function currentMarketingAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const campaign =
      normalizeCampaignId(params.get("campaign")) ||
      normalizeCampaignId(params.get("utm_campaign")) ||
      normalizeCampaignId(sessionStorage.getItem(CAMPAIGN_STORAGE_KEY));
    const explicitSource = normalizeAttributionSource(
      params.get("source") ||
      params.get("utm_source") ||
      sessionStorage.getItem(CAMPAIGN_SOURCE_STORAGE_KEY),
    );
    const utmSource = normalizeAttributionSource(
      params.get("utm_source") || sessionStorage.getItem(UTM_SOURCE_STORAGE_KEY),
    );
    const utmMedium = normalizeAttributionSource(
      params.get("utm_medium") || sessionStorage.getItem(UTM_MEDIUM_STORAGE_KEY),
    );
    const utmCampaign =
      normalizeCampaignId(params.get("utm_campaign")) ||
      normalizeCampaignId(sessionStorage.getItem(UTM_CAMPAIGN_STORAGE_KEY));
    const utmContent = normalizeAttributionSource(
      params.get("utm_content") || sessionStorage.getItem(UTM_CONTENT_STORAGE_KEY),
    );

    return {
      path: window.location.pathname.slice(0, 120),
      source: explicitSource !== "none" ? normalizeSource(explicitSource) : "direct",
      campaign: campaign || "none",
      utmSource: utmSource !== "none" ? utmSource : "",
      utmMedium: utmMedium !== "none" ? utmMedium : "",
      utmCampaign,
      utmContent: utmContent !== "none" ? utmContent : "",
    };
  } catch {
    return {
      path: "/pro",
      source: "direct",
      campaign: "none",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      utmContent: "",
    };
  }
}

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  async function submit(e) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    const attribution = currentMarketingAttribution();
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, ...attribution }),
      });
      if (res.ok) {
        track("waitlist_signup", attribution);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="nodata">You're on the list — we'll email you once alerts go live.</p>;
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <input
        type="email"
        required
        aria-label="Email address"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ flex: "1 1 200px", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line, #ccc)", background: "transparent", color: "inherit" }}
      />
      <button className="cta" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Joining…" : "Join the waitlist →"}
      </button>
      {status === "error" && (
        <p className="fine" style={{ color: "crimson", flexBasis: "100%" }}>
          We couldn't save your email. Nothing was charged. Please try again later.
        </p>
      )}
    </form>
  );
}
