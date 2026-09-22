import { notFound } from "next/navigation";
import AskingSoldGapBadge from "../../_components/AskingSoldGapBadge.jsx";

export const revalidate = 300;
const API = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/public-price-items";

async function getItem(slug) {
  const response = await fetch(`${API}?slug=${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Verified price data unavailable");
  return (await response.json()).item || null;
}
function usd(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value)) : "no data";
}

export async function generateMetadata({ params }) {
  const { itemSlug } = await params;
  const item = await getItem(itemSlug).catch(()=>null);
  if (!item) return { title: "Price record not found | BlindBoxAI", robots: { index: false, follow: false } };
  return {
    title: `${item.canonicalName} sold price | BlindBoxAI`,
    description: `Verified sold-price history for ${item.canonicalName}, based on ${item.verifiedSaleCount} exact verified sales.`,
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
  const cta = `/api/out/price-item?slug=${encodeURIComponent(item.slug)}&q=${encodeURIComponent(item.canonicalName)}`;
  return (
    <main style={{width:"min(820px,calc(100% - 32px))",margin:"40px auto 80px"}}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema)}} />
      <p style={{fontFamily:"monospace",opacity:.7}}>Verified price record</p>
      <h1>{item.canonicalName} sold price</h1>
      <p>Based on {item.verifiedSaleCount} exact verified completed sales.</p>
      <dl>
        <dt>Sold median</dt><dd>{usd(item.soldMedian)}</dd>
        <dt>Sold range</dt><dd>{usd(item.soldLow)} – {usd(item.soldHigh)}</dd>
        <dt>Asking median</dt><dd>{usd(item.askingMedian)}</dd>
        <dt>Asking vs sold gap</dt><dd><AskingSoldGapBadge askingMedian={item.askingMedian} soldMedian={item.soldMedian} /></dd>
        <dt>Sale dates</dt><dd>{item.saleDates?.length ? item.saleDates.map(x=>new Date(x).toLocaleDateString()).join(", ") : "no data"}</dd>
        <dt>Last checked</dt><dd>{item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString() : "no data"}</dd>
      </dl>
      <p><a href={cta}>Check current eBay listings through BlindBoxAI →</a></p>
      <p style={{fontSize:13,opacity:.75}}>Affiliate disclosure: BlindBoxAI may earn a commission from qualifying eBay purchases. Asking-price data is shown only when a verified source exists; otherwise it is “no data.”</p>
    </main>
  );
}
