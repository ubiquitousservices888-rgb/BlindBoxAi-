const PLACEHOLDER = /\b(?:ADD|REPLACE|INSERT|YOUR)_[A-Z0-9_]+\b|example\.com|\bplaceholder\b/i;

export const TWINKLE_STRONG_BREAD_OFFER = Object.freeze({
  id: "twinkle-twinkle-savor-the-moment--strong-bread",
  brand: "POP MART",
  seriesName: "Twinkle Twinkle Savor the Moment Series",
  seriesSlug: null,
  figure: "Strong Bread",
  rarity: "common",
  currency: "USD",
  referenceLow: 43,
  referenceCurrent: 46,
  referenceHigh: 55,
  checkedAt: "2026-08-25",
  evidence: "Reviewed price-history snapshot observed at $43–$55 with a $46 reference current price; source rechecked 2026-08-25.",
  sourceLabel: "Market price-history source",
  sourceUrl: "https://editorialist.com/p/pop-mart-twinkle-savor-the-moment-series-figure-strong-bread/",
  officialUrl: "https://www.popmart.com/us/products/3813/Twinkle-Twinkle-Savor-the-Moment-Series-Figures",
  searchQuery: "POP MART Twinkle Twinkle Savor the Moment Strong Bread",
  priority: 0,
});

export function slugPart(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function revenueOfferId(seriesSlug, figureName) {
  const series = slugPart(seriesSlug);
  const figure = slugPart(figureName);
  if (!series || !figure) throw new Error("Revenue offer requires a series slug and figure name");
  return `${series}--${figure}`;
}

export function verifiedFigureOffer(series, figure) {
  if (!series || !figure || figure.needsReview !== false) return null;

  const low = Number(figure.resaleLow);
  const high = Number(figure.resaleHigh);
  const evidence = String(figure.evidence ?? "").trim().replace(/\s+/g, " ");
  const figureName = String(figure.name ?? "").trim().replace(/\s+/g, " ");
  const seriesSlug = String(series.slug ?? "").trim();
  const seriesName = String(series.name ?? "").trim().replace(/\s+/g, " ");
  const brand = String(series.brand ?? "").trim().replace(/\s+/g, " ");

  if (!figureName || !seriesSlug || !seriesName || !brand || !evidence || PLACEHOLDER.test(evidence)) return null;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) return null;

  const referenceCurrent = Math.round(((low + high) / 2) * 100) / 100;

  return {
    id: revenueOfferId(seriesSlug, figureName),
    brand,
    seriesName,
    seriesSlug,
    figure: figureName,
    rarity: String(figure.rarity || "unspecified"),
    currency: "USD",
    referenceLow: low,
    referenceCurrent,
    referenceHigh: high,
    checkedAt: series?.marketPricing?.checkedAt || null,
    evidence,
    sourceLabel: "BlindBoxAI reviewed transaction evidence",
    sourceUrl: null,
    officialUrl: null,
    searchQuery: `${brand} ${seriesName} ${figureName}`,
    priority: /twinkle/i.test(`${brand} ${seriesName} ${figureName}`) ? 10 : 100,
  };
}

export function evaluateOfferPrice(offer, value) {
  if (!offer) throw new Error("Offer is required");
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, code: "INVALID_PRICE", message: "Enter a total purchase price greater than $0." };
  }

  const low = Number(offer.referenceLow);
  const current = Number(offer.referenceCurrent);
  const high = Number(offer.referenceHigh);
  if (![low, current, high].every(Number.isFinite) || low <= 0 || current < low || high < current) {
    throw new Error("Offer reference range is invalid");
  }

  const unusualLow = Math.round(low * 0.7 * 100) / 100;
  const favorableCeiling = Math.min(high, Math.round(current * 1.05 * 100) / 100);
  let verdict;

  if (price < unusualLow) {
    verdict = {
      code: "VERIFY",
      label: "Verify first",
      tone: "warning",
      summary: "This price is far below the reviewed reference range. Treat that as a verification signal: check authenticity, condition, completeness, and seller history before paying.",
    };
  } else if (price <= favorableCeiling) {
    verdict = {
      code: "GOOD",
      label: "Good price",
      tone: "good",
      summary: "This is at or below the favorable portion of the reviewed reference range. If authenticity and condition check out, the price compares well with the available evidence.",
    };
  } else if (price <= high) {
    verdict = {
      code: "FAIR",
      label: "Fair market price",
      tone: "neutral",
      summary: "This is inside the reviewed reference range but above its midpoint. Compare condition, seller quality, shipping, and alternatives before buying.",
    };
  } else {
    verdict = {
      code: "HIGH",
      label: "High price",
      tone: "high",
      summary: "This is above the reviewed reference high. Unless the item has unusually strong condition, provenance, or extras, comparing alternatives is sensible.",
    };
  }

  const normalizedPrice = Math.round(price * 100) / 100;
  const delta = Math.round((normalizedPrice - current) * 100) / 100;
  const deltaPct = Math.round(((normalizedPrice - current) / current) * 1000) / 10;

  return {
    ok: true,
    price: normalizedPrice,
    verdict,
    deltaFromCurrent: delta,
    deltaPctFromCurrent: deltaPct,
  };
}

export function sortRevenueOffers(offers) {
  return (Array.isArray(offers) ? offers : [])
    .slice()
    .sort((a, b) => {
      const priorityDelta = Number(a?.priority ?? 1000) - Number(b?.priority ?? 1000);
      if (priorityDelta) return priorityDelta;
      const seriesDelta = String(a?.seriesName ?? "").localeCompare(String(b?.seriesName ?? ""));
      if (seriesDelta) return seriesDelta;
      return String(a?.figure ?? "").localeCompare(String(b?.figure ?? ""));
    });
}
