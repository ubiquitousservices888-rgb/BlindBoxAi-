import fs from "fs";
import path from "path";

import { buildEbaySearchUrl } from "./affiliate-policy.mjs";

const DIR = path.join(process.cwd(), "data", "series");

export function allSeries() {
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSeries(slug) {
  return allSeries().find(s => s.slug === slug) || null;
}

// Verified = every priced figure confirmed (needsReview false)
export function seriesVerified(s) {
  const priced = s.figures.filter(f => f.resaleLow != null);
  return priced.length > 0 && priced.every(f => !f.needsReview);
}

export function priceSpan(s) {
  const lows = s.figures
    .filter(f => f.resaleLow != null)
    .map(f => f.resaleLow);

  const highs = s.figures
    .filter(f => f.resaleHigh != null)
    .map(f => f.resaleHigh);

  if (!lows.length) return null;

  return {
    low: Math.min(...lows),
    high: Math.max(...highs),
  };
}

function customIdPart(value, maxLength) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, maxLength);
}

export function epnCustomId({
  seriesSlug,
  figure,
  kind,
  placement,
}) {
  const value =
    "bb1" +
    "s" + customIdPart(seriesSlug, 50) +
    "f" + customIdPart(figure, 100) +
    "k" + customIdPart(kind, 20) +
    "p" + customIdPart(placement, 40);

  // Stay below eBay's 256-character Custom ID ceiling.
  return value.slice(0, 240);
}

export function ebaySoldLink(query, customId = "") {
  return buildEbaySearchUrl({
    query,
    kind: "sold",
    customId,
    campid: process.env.NEXT_PUBLIC_EPN_CAMPID,
  });
}

export function ebayActiveLink(query, customId = "") {
  return buildEbaySearchUrl({
    query,
    kind: "active",
    customId,
    campid: process.env.NEXT_PUBLIC_EPN_CAMPID,
  });
}

export function ebayOutboundPath(
  seriesSlug,
  figure,
  kind,
) {
  const params = new URLSearchParams({
    series: seriesSlug,
    figure,
    kind,
    placement: "series_table",
  });

  return `/api/out/ebay?${params.toString()}`;
}

/*
 * Backward compatibility for older components.
 * Existing behavior remains the sold-comparison destination.
 */
export function ebayLink(query) {
  return ebaySoldLink(query);
}
