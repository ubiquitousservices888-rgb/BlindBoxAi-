// Fixed primary-source destinations: callers cannot supply fetch URLs.
export const OFFICIAL_COLLECTION_URL = "https://www.popmart.com/us/collection/11/the-monsters";
export const OFFICIAL_PRODUCT_URL = "https://www.popmart.com/us/products/7890/the-monsters-hair-salon-series-vinyl-plush-pendant-blind-box";

export function parseOfficialProducts(html, researchedAt) {
  const results = [];
  for (const [anchor] of String(html).matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = anchor.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
    if (!href) continue;
    let url;
    try { url = new URL(href, OFFICIAL_COLLECTION_URL); } catch { continue; }
    if (url.origin !== "https://www.popmart.com" || url.search || url.hash || !/^\/us\/products\/7890\/the-monsters-hair-salon-series-{1,3}vinyl-plush-pendant-blind-box$/.test(url.pathname)) continue;
    const text = anchor.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (!/THE MONSTERS Hair Salon Series\s*(?:-\s*)?Vinyl Plush Pendant Blind Box/i.test(text)) continue;
    const prices = [...text.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map(match => Number(match[1]));
    if (prices.length !== 1 || prices[0] <= 0 || prices[0] > 1000) continue;
    results.push({ title: "THE MONSTERS Hair Salon Series Vinyl Plush Pendant Blind Box", topic: "pop-mart-and-labubu", source: "POP MART official collection", url: OFFICIAL_COLLECTION_URL,
      summary: `Official US collection currently lists this product at $${prices[0].toFixed(2)} USD retail. This is a retail listing, not a completed sale or a stock guarantee.`,
      productUrl: OFFICIAL_PRODUCT_URL, retailUSD: prices[0], published: null, researchedAt,
      evidenceType: "official-product", verificationStatus: "source-matched", completedSaleEvidence: false });
  }
  return results.slice(0, 1);
}

export async function refreshOfficialProducts({ fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  try {
    const response = await fetchImpl(OFFICIAL_COLLECTION_URL, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.body) return [];
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) return [];
      chunks.push(Buffer.from(chunk));
    }
    return parseOfficialProducts(Buffer.concat(chunks).toString("utf8"), now());
  } catch { return []; }
}
