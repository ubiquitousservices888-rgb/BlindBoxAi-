import { allSeries } from "../lib/data";
import { allRevenueOffers } from "../lib/revenue-offers";

const SITE = "https://www.blindboxai.com";

export default function sitemap() {
  const stable = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/tools/buy-or-pass`, changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE}/ask`, changeFrequency: "weekly", priority: 0.8 },
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

  return [...stable, ...offerPages, ...seriesPages];
}
