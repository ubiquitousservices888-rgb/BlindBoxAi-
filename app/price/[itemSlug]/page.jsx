import { notFound } from "next/navigation";

import AskingSoldGapBadge from "../../_components/AskingSoldGapBadge.jsx";
import { parsePriceSlug } from "../../../lib/price-page-core.mjs";
import { publicPriceApiUrl } from "../../../lib/public-price-api.mjs";

export const revalidate = 300;

async function getItem(slug) {
  const parsed = parsePriceSlug(slug);
  if (!parsed) return null;
  const api = publicPriceApiUrl();
  const response = await fetch(
    `${api}?id=${encodeURIComponent(parsed.id)}&condition=${encodeURIComponent(parsed.conditionType)}`,
    { next: { revalidate: 300 } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Verified price data unavailable");
  return (await response.json()).item || null;
}

function usd(value) {
  if (value === null || value === undefined || value === "") return "no data";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "no data";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function utcDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "no data";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(date.getTime())) return "no data";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(date);
}

export async function generateMetadata({ params }) {
  const { itemSlug } = await params;
  const item = await getItem(itemSlug).catch(() => null);
  if (!item) return { title: "Price record not found | BlindBoxAI", robots: { index: false, follow: false } };
  return {
    title: `${item.canonicalName} ${item.conditionType} sold price | BlindBoxAI`,
    description: `Verified ${item.conditionType} sold-price history for ${item.canonicalName}, based on ${item.verifiedSaleCount} exact verified sales.`,
  };
}

export default async function PriceItemPage({ params }) {
  const { itemSlug } = await params;
  const item = await getItem(itemSlug);
  if (!item || item.verifiedSaleCount < 2) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.canonicalName,
    brand: item.brand ? { "@type": "Brand", name: item.brand } : undefined,
    sku: item.itemNumber || undefined,
    category: item.series || item.vertical || undefined,
  };
  const safeSchema = JSON.stringify(schema).replace(/</g, "\\u003c");
  const cta = `/api/out/price-item?slug=${encodeURIComponent(itemSlug)}&q=${encodeURIComponent(item.canonicalName)}`;

  return (
    <main style={{ width: "min(820px,calc(100% - 32px))", margin: "40px auto 80px" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeSchema }} />
      <p style={{ fontFamily: "monospace", opacity: .7 }}>Verified price record</p>
      <h1>{item.canonicalName} sold price</h1>
      <p>Condition: <strong>{item.conditionType}</strong>. Based on {item.verifiedSaleCount} exact verified completed sales.</p>
      <dl>
        <dt>Sold median</dt><dd>{usd(item.soldMedian)}</dd>
        <dt>Sold range</dt><dd>{usd(item.soldLow)} – {usd(item.soldHigh)}</dd>
        <dt>Asking median</dt><dd>{usd(item.askingMedian)}</dd>
        <dt>Asking vs sold gap</dt><dd><AskingSoldGapBadge askingMedian={item.askingMedian} soldMedian={item.soldMedian} /></dd>
        <dt>Sale dates</dt><dd>{item.saleDates?.length ? item.saleDates.map(utcDate).join(", ") : "no data"}</dd>
        <dt>Last checked</dt><dd>{utcDate(item.lastCheckedAt)}</dd>
      </dl>
      <p><a href={cta}>Check current eBay listings through BlindBoxAI →</a></p>
      <p style={{ fontSize: 13, opacity: .75 }}>Affiliate disclosure: BlindBoxAI may earn a commission from qualifying eBay purchases. Raw and graded markets are never pooled. Asking-price data is shown only when a verified source exists; otherwise it is “no data.”</p>
    </main>
  );
}
