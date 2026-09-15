"use client";

function recordClick(payload) {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        "/api/events/amazon-affiliate-click",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
    }
  } catch {}

  fetch("/api/events/amazon-affiliate-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

export default function AmazonAffiliateLink({
  href,
  offerId,
  campaignId = "",
  source = "amazon_accessories",
  className = "",
  ariaLabel,
  children,
}) {
  return (
    <a
      className={className}
      href={href}
      aria-label={ariaLabel}
      rel="sponsored nofollow"
      onClick={() => recordClick({ offerId, campaignId, source })}
    >
      {children}
    </a>
  );
}
