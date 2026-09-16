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

export default function AskVisualListings({ query = "" }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const clean = String(query || "").trim();
    if (clean.length < 2) {
      setItems([]);
      setReady(true);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setReady(false);
    setItems([]);

    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: clean, source: "ask" });
      fetch(`/api/ebay/search?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then(response => (response.ok ? response.json() : null))
        .then(payload => {
          if (!active) return;
          if (Array.isArray(payload?.items)) setItems(payload.items);
        })
        .catch(error => {
          if (!active || error?.name === "AbortError") return;
          setItems([]);
        })
        .finally(() => {
          if (active) setReady(true);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (!query?.trim()) return null;

  return (
    <section className="visual-results" aria-live="polite">
      <div className="visual-head">
        <div>
          <p className="visual-kicker">Interactive visual research</p>
          <h3>Cards and collectibles matching your question</h3>
        </div>
        <span>{ready ? `${items.length} visual matches` : "Loading images…"}</span>
      </div>

      <p className="visual-note">
        These are real current eBay listing images for visual research. Listing prices are asking prices, not verified completed-sale values and are never used as sold comps.
      </p>

      {!ready && <div className="visual-loading">Finding current collectible images…</div>}

      {ready && items.length === 0 && (
        <div className="visual-empty">
          No live listing images were returned for this search yet. Your verified sold-data result above is unchanged.
        </div>
      )}

      {items.length > 0 && (
        <div className="visual-grid">
          {items.map(item => (
            <a
              className="visual-card"
              key={item.itemId}
              href={item.clickPath}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
            >
              <div className="visual-image-wrap">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title || "Collectible listing"}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="visual-placeholder">Image unavailable</div>
                )}
              </div>
              <strong>{item.title}</strong>
              <div className="visual-meta">
                <span>{formatPrice(item)}</span>
                {item.condition ? <span>{item.condition}</span> : null}
              </div>
              <span className="visual-link">Open current listing ↗</span>
            </a>
          ))}
        </div>
      )}

      <style jsx>{`
        .visual-results{margin-top:20px;border-top:1px solid var(--line);padding-top:18px}.visual-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}.visual-head h3{margin:3px 0 0;font-size:1.05rem}.visual-head>span{font-size:.72rem;color:var(--muted);white-space:nowrap}.visual-kicker{margin:0;color:var(--verify-ink);font-family:"Spline Sans Mono",monospace;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.visual-note{margin:9px 0 14px;color:var(--muted);font-size:.8rem;line-height:1.5}.visual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.visual-card{display:flex;min-width:0;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:13px;background:#fff;color:inherit;text-decoration:none}.visual-card:active{transform:scale(.99)}.visual-image-wrap{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1/1;border-radius:9px;background:#f5f6f3;overflow:hidden}.visual-image-wrap img{width:100%;height:100%;object-fit:contain}.visual-placeholder{padding:12px;color:var(--muted);font-size:.74rem;text-align:center}.visual-card strong{display:-webkit-box;overflow:hidden;font-size:.82rem;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:3}.visual-meta{display:flex;flex-direction:column;gap:2px;color:var(--muted);font-size:.72rem}.visual-meta span:first-child{color:var(--ink);font-family:"Spline Sans Mono",monospace;font-weight:700}.visual-link{margin-top:auto;color:var(--verify-ink);font-size:.73rem;font-weight:700}.visual-loading,.visual-empty{border:1px dashed var(--line-strong);border-radius:12px;padding:16px;color:var(--muted);font-size:.8rem;line-height:1.45}
        @media(min-width:620px){.visual-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:520px){.visual-head{align-items:flex-start;flex-direction:column}.visual-head>span{white-space:normal}}
      `}</style>
    </section>
  );
}
