"use client";

import { useEffect, useState } from "react";

function formatPrice(item) {
  if (!item?.price) return "See listing";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: item.currency || "USD",
    }).format(Number(item.price));
  } catch {
    return `${item.currency || "USD"} ${item.price}`;
  }
}

export default function LiveEbayListings({
  seriesSlug = "",
  offerId = "",
  campaignId = "",
  source = "page",
  heading = "Live eBay listings",
}) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!seriesSlug && !offerId) {
      setReady(true);
      return undefined;
    }

    const controller = new AbortController();
    const isOffer = Boolean(offerId);
    const params = new URLSearchParams(isOffer ? { offer: offerId } : { series: seriesSlug });
    if (campaignId) params.set("campaign", campaignId);
    if (source) params.set("source", source);

    fetch(`${isOffer ? "/api/ebay/live-offer" : "/api/ebay/live"}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        if (Array.isArray(payload?.items)) setItems(payload.items);
      })
      .catch(() => {})
      .finally(() => setReady(true));

    return () => controller.abort();
  }, [seriesSlug, offerId, campaignId, source]);

  if (!ready || items.length === 0) return null;

  return (
    <section className="block">
      <h2>{heading} <span className="k">PRODUCTION API</span></h2>
      <p style={{ margin: "10px 0 16px", fontSize: "0.82rem", lineHeight: 1.5, opacity: 0.82 }}>
        Current fixed-price listings supplied by eBay. As an eBay Partner, BlindBoxAI may earn a commission from qualifying purchases.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
        {items.map(item => (
          <a
            key={item.itemId}
            href={item.clickPath}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "10px",
              border: "1px solid var(--line)",
              borderRadius: "12px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: "8px" }}
              />
            ) : null}
            <strong style={{ fontSize: "0.88rem", lineHeight: 1.35 }}>{item.title}</strong>
            <span className="mono">{formatPrice(item)}</span>
            {item.condition ? <span style={{ fontSize: "0.74rem", opacity: 0.72 }}>{item.condition}</span> : null}
            <span className="ebay">View current listing ↗</span>
          </a>
        ))}
      </div>
    </section>
  );
}
