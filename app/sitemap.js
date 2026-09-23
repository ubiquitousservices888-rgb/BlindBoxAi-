import { allSeries } from "../lib/data";
import { allRevenueOffers } from "../lib/revenue-offers";
import { priceSlug } from "../lib/price-page-core.mjs";
import { publicPriceApiUrl } from "../lib/public-price-api.mjs";

const SITE = "https://www.blindboxai.com";

async function verifiedPriceRoutes() {
  try {
    const response = await fetch(publicPriceApiUrl(), { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const body = await response.json();
    return (Array.isArray(body?.items) ? body.items : []).map((item) => ({
      url: `${SITE}/price/${priceSlug(item)}`,
      changeFrequency: "daily",
      priority: 0.8,
      lastModified: item.lastCheckedAt ? new Date(item.lastCheckedAt) : undefined,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const stable = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/tools/buy-or-pass`, changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE}/ask`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/ai-family`, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE}/guides/mew-ex-152-vs-158`, changeFrequency: "daily", priority: 0.9 },
  ];

  const offerPages = allRevenueOffers().map((offer) => ({
    url: `${SITE}/tools/buy-or-pass/${offer.id}`,
    changeFrequency: "daily",
    priority: offer.id.startsWith("twinkle-") ? 0.95 : 0.85,
  }));

  const seriesPages = allSeries().map((series) => ({
    url: `${SITE}/series/${series.slug}`,
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  return [...stable, ...offerPages, ...seriesPages, ...await verifiedPriceRoutes()];
}
