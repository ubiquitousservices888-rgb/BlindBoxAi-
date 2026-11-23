"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

// These are the owner's own Gumroad products, not eBay or Amazon affiliate listings.
// Keep the product IDs explicit: Gumroad's official embed widget uses these IDs.
const PRODUCTS = Object.freeze([
  Object.freeze({
    id: "bjfpgf",
    title: "The Fake-Check Field Guide — Pop Mart and Pokémon",
    url: "https://ubiquity6.gumroad.com/l/bjfpgf",
  }),
  Object.freeze({
    id: "fxloos",
    title: "Sports Card Collecting Series — Beginner, Novice and Pro (3 volumes)",
    url: "https://ubiquity6.gumroad.com/l/fxloos",
  }),
]);

const PREVIEW_FLAG = "blindboxai_gumroad_previews_once";

export default function FakeCheckGumroadEmbeds() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only activate Gumroad after a deliberate visitor click, carried through
    // a full page navigation so its widget scanner starts on fresh DOM nodes.
    try {
      if (window.sessionStorage.getItem(PREVIEW_FLAG) === pathname) {
        window.sessionStorage.removeItem(PREVIEW_FLAG);
        setEnabled(true);
      }
    } catch {
      // If storage is blocked, visitors still have direct Gumroad links.
    }
  }, [pathname]);

  function requestPreviews() {
    if (enabled) return;
    try {
      window.sessionStorage.setItem(PREVIEW_FLAG, pathname);
      // A full reload avoids re-running Gumroad's injected bundle in a SPA.
      // Preserve source/campaign query parameters for attribution.
      window.location.reload();
    } catch {
      // Private browsing may block sessionStorage; try without a reload.
      setEnabled(true);
    }
  }

  return (
    <aside
      data-testid="fake-check-gumroad-embeds"
      aria-label="Gumroad collector guide and sports card bundle"
      style={{ marginTop: 18, padding: "16px", border: "1px solid var(--line)", borderRadius: 12 }}
    >
      <h3 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Collector guides and card bundles</h3>
      <p style={{ marginBottom: 12 }}>
        Preview both digital products here, then complete any purchase securely on Gumroad.
        These educational resources do not authenticate or appraise collectibles.
      </p>
      <button
          type="button"
          data-testid="load-gumroad-product-previews"
          onClick={requestPreviews}
          style={{
            border: "1px solid var(--verify)",
            borderRadius: 8,
            background: "var(--verify)",
            color: "#fff",
            padding: "11px 15px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          {enabled ? "Gumroad previews requested" : "Show the two Gumroad product previews"}
        </button>
      <div id="gumroad-product-choices" style={{ display: "grid", gap: 16 }}>
        {PRODUCTS.map((product) => (
          <section
            key={product.id}
            aria-label={product.title}
            style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}
          >
            <h4 style={{ fontSize: "0.95rem", marginBottom: 8 }}>{product.title}</h4>
            {enabled ? (
              <div
                className="gumroad-product-embed"
                data-gumroad-product-id={product.id}
                data-testid={`gumroad-inline-${product.id}`}
              >
                <a href={product.url} target="_blank" rel="noopener noreferrer">
                  Open this product directly on Gumroad
                </a>
              </div>
            ) : (
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                See product on Gumroad
              </a>
            )}
          </section>
        ))}
      </div>
      {enabled ? (
        <>
          <Script
            id="blindboxai-gumroad-product-embed"
            src="https://gumroad.com/js/gumroad-embed.js"
            strategy="afterInteractive"
            onReady={() => setLoaded(true)}
            onError={() => setLoadFailed(true)}
          />
          <p role="status" aria-live="polite" style={{ fontSize: 12, marginTop: 10, color: "var(--muted)" }}>
          {loadFailed
            ? "Product previews could not load. Use the direct Gumroad links above."
            : loaded
              ? "Gumroad preview script loaded. If previews do not appear, use the direct product links."
              : "Loading Gumroad product previews…"}
          </p>
        </>
      ) : (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          Third-party Gumroad content loads only when you choose to show the previews.
        </p>
      )}
    </aside>
  );
}
