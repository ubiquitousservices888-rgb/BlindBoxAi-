"use client";

import { useEffect } from "react";
import { preserveInternalCampaignLink } from "../../lib/campaign-attribution.mjs";

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

      const rawHref = anchor.getAttribute("href") || "";
      if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

      const attributedHref = preserveInternalCampaignLink(window.location.href, rawHref);
      if (!attributedHref) return;
      const originalUrl = new URL(rawHref, window.location.href);
      if (attributedHref === `${originalUrl.pathname}${originalUrl.search}${originalUrl.hash}`) return;

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
