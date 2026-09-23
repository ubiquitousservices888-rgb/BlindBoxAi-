import { median } from "./price-page-core.mjs";

export const MEW_30TH_CHECKED_AT = "2026-09-23";

export const MEW_30TH_CARDS = Object.freeze([
  Object.freeze({
    key: "152",
    number: "152/128",
    rarity: "Special Illustration Rare",
    illustrator: "Kuroimori",
    conditionType: "raw",
    query: "Pokemon 30th Celebration Mew ex 152/128",
    priceSlug: "mew-ex-152-30th-celebration--raw--mew152",
    completedSales: Object.freeze([
      Object.freeze({ soldAt: "2026-09-17", amount: 175.00 }),
      Object.freeze({ soldAt: "2026-09-19", amount: 180.00 }),
      Object.freeze({ soldAt: "2026-09-20", amount: 200.00 }),
      Object.freeze({ soldAt: "2026-09-21", amount: 165.00 }),
      Object.freeze({ soldAt: "2026-09-21", amount: 179.00 }),
      Object.freeze({ soldAt: "2026-09-22", amount: 185.00 }),
    ]),
  }),
  Object.freeze({
    key: "158",
    number: "158/128",
    rarity: "Futuristic Rare",
    illustrator: "YOSHIROTTEN",
    conditionType: "raw",
    query: "Pokemon 30th Celebration Mew ex 158/128",
    priceSlug: "mew-ex-158-30th-celebration--raw--mew158",
    completedSales: Object.freeze([
      Object.freeze({ soldAt: "2026-09-19", amount: 130.00 }),
      Object.freeze({ soldAt: "2026-09-19", amount: 120.00 }),
      Object.freeze({ soldAt: "2026-09-19", amount: 159.99 }),
      Object.freeze({ soldAt: "2026-09-21", amount: 120.00 }),
      Object.freeze({ soldAt: "2026-09-22", amount: 100.00 }),
      Object.freeze({ soldAt: "2026-09-22", amount: 119.99 }),
    ]),
  }),
]);

export function mew30thSummary(card) {
  const values = card.completedSales.map((sale) => sale.amount);
  return {
    completedSaleCount: values.length,
    median: median(values),
    low: Math.min(...values),
    high: Math.max(...values),
    latestSaleAt: card.completedSales.map((sale) => sale.soldAt).sort().at(-1) || null,
  };
}

export function mew30thOutboundPath(card) {
  const params = new URLSearchParams({
    slug: card.priceSlug,
    q: card.query,
    source: "mew_30th_guide",
  });
  return `/api/out/price-item?${params.toString()}`;
}
