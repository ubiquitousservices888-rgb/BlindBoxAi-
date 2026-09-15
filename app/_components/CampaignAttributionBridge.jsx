"use client";

import { useEffect } from "react";

import {
  normalizeCampaignId,
  normalizeSource,
} from "../../lib/campaign-attribution.mjs";

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export default function CampaignAttributionBridge() {
  useEffect(() => {
    function preserveAttribution(event) {
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;

      const current = new URL(window.location.href);
      const campaignId = normalizeCampaignId(current.searchParams.get("campaign"));
      if (!campaignId) return;
      const source = normalizeSource(current.searchParams.get("source") || "page");

      const rawHref = anchor.getAttribute("href") || "";
      if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

      const next = new URL(rawHref, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (!next.searchParams.has("campaign")) next.searchParams.set("campaign", campaignId);
      if (!next.searchParams.has("source")) next.searchParams.set("source", source);

      const attributedHref = `${next.pathname}${next.search}${next.hash}`;
      anchor.setAttribute("href", attributedHref);

      if (anchor.target === "_blank") return;

      event.preventDefault();
      window.location.assign(attributedHref);
    }

    document.addEventListener("click", preserveAttribution, true);
    return () => document.removeEventListener("click", preserveAttribution, true);
  }, []);

  return null;
}
