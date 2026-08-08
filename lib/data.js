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
  const lows = s.figures.filter(f => f.resaleLow != null).map(f => f.resaleLow);
  const highs = s.figures.filter(f => f.resaleHigh != null).map(f => f.resaleHigh);
  if (!lows.length) return null;
  return { low: Math.min(...lows), high: Math.max(...highs) };
}
function addEpnTracking(base) {
  const campid = process.env.NEXT_PUBLIC_EPN_CAMPID;

  if (!campid) return base;

  return (
    base +
    "&mkcid=1" +
    "&mkrid=711-53200-19255-0" +
    "&siteid=0" +
    "&campid=" +
    encodeURIComponent(campid) +
    "&toolid=10001" +
    "&mkevt=1"
  );
}

export function ebaySoldLink(query) {
  const base =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query) +
    "&LH_Sold=1&LH_Complete=1";

  return addEpnTracking(base);
}

export function ebayActiveLink(query) {
  const base =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query);

  return addEpnTracking(base);
}

/*
 * Backward compatibility for any older component that still imports ebayLink.
 * Existing behavior remains the sold-comparison destination.
 */
export function ebayLink(query) {
  return ebaySoldLink(query);
}
