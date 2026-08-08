import fs from "fs";
import path from "path";

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

function addEpnTracking(base, customId = "") {
  const campid = process.env.NEXT_PUBLIC_EPN_CAMPID;

  if (!campid) return base;

  let url =
    base +
    "&mkcid=1" +
    "&mkrid=711-53200-19255-0" +
    "&siteid=0" +
    "&campid=" +
    encodeURIComponent(campid) +
    "&toolid=10001" +
    "&mkevt=1";

  if (customId) {
    url += "&customid=" + encodeURIComponent(customId);
  }

  return url;
}

export function ebaySoldLink(query, customId = "") {
  const base =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query) +
    "&LH_Sold=1&LH_Complete=1";

  return addEpnTracking(base, customId);
}

export function ebayActiveLink(query, customId = "") {
  const base =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query);

  return addEpnTracking(base, customId);
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
