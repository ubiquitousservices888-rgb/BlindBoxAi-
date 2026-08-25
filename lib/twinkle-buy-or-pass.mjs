export const TWINKLE_STRONG_BREAD_REFERENCE = Object.freeze({
  brand: "POP MART",
  series: "Twinkle Twinkle Savor the Moment Series",
  figure: "Strong Bread",
  currency: "USD",
  officialBlindBoxRetail: 19.99,
  market: Object.freeze({
    low: 43,
    current: 46,
    high: 55,
    observedAt: "2026-08-06",
    checkedAt: "2026-08-25",
  }),
  sources: Object.freeze({
    official: "https://www.popmart.com/us/products/3813/Twinkle-Twinkle-Savor-the-Moment-Series-Figures",
    market: "https://editorialist.com/p/pop-mart-twinkle-savor-the-moment-series-figure-strong-bread/",
  }),
});

export function evaluateStrongBreadPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      ok: false,
      code: "INVALID_PRICE",
      message: "Enter a total purchase price greater than $0.",
    };
  }

  const { low, current, high } = TWINKLE_STRONG_BREAD_REFERENCE.market;
  const unusualLow = Math.round(low * 0.7 * 100) / 100;
  const currentCeiling = Math.round(current * 1.05 * 100) / 100;
  let verdict;

  if (price < unusualLow) {
    verdict = {
      code: "VERIFY",
      label: "Verify first",
      tone: "warning",
      summary: "This is far below the recent observed range. It could be a bargain, but verify authenticity, condition, completeness, and seller history before paying.",
    };
  } else if (price < low) {
    verdict = {
      code: "GOOD",
      label: "Good price",
      tone: "good",
      summary: "This is below the recent observed range. If authenticity and condition check out, the price is favorable versus the reference snapshot.",
    };
  } else if (price <= currentCeiling) {
    verdict = {
      code: "GOOD",
      label: "Good price",
      tone: "good",
      summary: "This is close to or below the recent observed current price and sits inside the reference range.",
    };
  } else if (price <= high) {
    verdict = {
      code: "FAIR",
      label: "Fair market price",
      tone: "neutral",
      summary: "This is inside the recent observed range, but above the reference current price. Compare condition and seller quality before buying.",
    };
  } else {
    verdict = {
      code: "HIGH",
      label: "High price",
      tone: "high",
      summary: "This is above the recent observed high. Unless the item has unusually strong condition, provenance, or extras, waiting or comparing alternatives may be better.",
    };
  }

  const delta = Math.round((price - current) * 100) / 100;
  const deltaPct = Math.round(((price - current) / current) * 1000) / 10;

  return {
    ok: true,
    price: Math.round(price * 100) / 100,
    verdict,
    reference: TWINKLE_STRONG_BREAD_REFERENCE,
    deltaFromCurrent: delta,
    deltaPctFromCurrent: deltaPct,
  };
}
