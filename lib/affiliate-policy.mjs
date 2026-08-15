export const EPN_MKRID = "711-53200-19255-0";
export const SKIMLINKS_EXCLUDED_HOSTS = Object.freeze(["ebay.com"]);

const EPN_TOOL_ID = "10001";
const EPN_EVENT_ID = "1";
const EPN_MEDIA_CHANNEL_ID = "1";

function asUrl(value) {
  return value instanceof URL ? new URL(value) : new URL(String(value));
}

export function isEbayHostname(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/\.$/, "");
  return normalized === "ebay.com" || normalized.endsWith(".ebay.com");
}

export function shouldUseSkimlinks(rawUrl) {
  const hostname = asUrl(rawUrl).hostname.toLowerCase();
  return !SKIMLINKS_EXCLUDED_HOSTS.some(
    host => hostname === host || hostname.endsWith(`.${host}`),
  );
}

export function assertEbayBypassesSkimlinks(rawUrl) {
  const url = asUrl(rawUrl);
  if (!isEbayHostname(url.hostname)) {
    throw new Error("Expected an eBay destination");
  }
  if (shouldUseSkimlinks(url)) {
    throw new Error("eBay destinations must bypass Skimlinks");
  }
}

export function buildEbaySearchUrl({
  query,
  kind = "active",
  customId = "",
  campid = "",
}) {
  const searchQuery = String(query ?? "").trim();
  if (!searchQuery) throw new Error("An eBay search query is required");
  if (kind !== "active" && kind !== "sold") {
    throw new Error("eBay link kind must be active or sold");
  }

  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", searchQuery);

  if (kind === "sold") {
    url.searchParams.set("LH_Sold", "1");
    url.searchParams.set("LH_Complete", "1");
  }

  const normalizedCampid = String(campid ?? "").trim();
  if (normalizedCampid) {
    if (!/^\d{7,12}$/.test(normalizedCampid)) {
      throw new Error("EPN campid must be 7 to 12 digits");
    }

    const normalizedCustomId = String(customId ?? "").trim();
    if (normalizedCustomId.length > 256) {
      throw new Error("EPN customid exceeds 256 characters");
    }

    url.searchParams.set("mkcid", EPN_MEDIA_CHANNEL_ID);
    url.searchParams.set("mkrid", EPN_MKRID);
    url.searchParams.set("siteid", "0");
    url.searchParams.set("campid", normalizedCampid);
    url.searchParams.set("toolid", EPN_TOOL_ID);
    url.searchParams.set("mkevt", EPN_EVENT_ID);
    if (normalizedCustomId) url.searchParams.set("customid", normalizedCustomId);
  }

  assertEbayBypassesSkimlinks(url);
  return url.toString();
}

export function auditEpnUrl(rawUrl, { kind, requireTracking = true } = {}) {
  const reasons = [];
  let url;

  try {
    url = asUrl(rawUrl);
  } catch {
    return { ok: false, reasons: ["invalid URL"] };
  }

  if (url.protocol !== "https:") reasons.push("HTTPS is required");
  if (!isEbayHostname(url.hostname)) reasons.push("destination is not eBay");
  if (!url.searchParams.get("_nkw")) reasons.push("search query is missing");
  if (shouldUseSkimlinks(url)) reasons.push("eBay would be routed through Skimlinks");

  const hasSold = url.searchParams.get("LH_Sold") === "1";
  const hasComplete = url.searchParams.get("LH_Complete") === "1";
  if (kind === "active" && (hasSold || hasComplete)) {
    reasons.push("active-listing URL contains sold-history filters");
  }
  if (kind === "sold" && (!hasSold || !hasComplete)) {
    reasons.push("sold-comps URL is missing sold-history filters");
  }

  if (requireTracking) {
    if (url.searchParams.get("mkcid") !== EPN_MEDIA_CHANNEL_ID) reasons.push("mkcid is invalid");
    if (url.searchParams.get("mkrid") !== EPN_MKRID) reasons.push("mkrid is invalid");
    if (url.searchParams.get("siteid") !== "0") reasons.push("siteid is invalid");
    if (!/^\d{7,12}$/.test(url.searchParams.get("campid") ?? "")) reasons.push("campid is missing or malformed");
    if (url.searchParams.get("toolid") !== EPN_TOOL_ID) reasons.push("toolid is invalid");
    if (url.searchParams.get("mkevt") !== EPN_EVENT_ID) reasons.push("mkevt is invalid");

    const customId = url.searchParams.get("customid") ?? "";
    if (!customId || customId.length > 256) reasons.push("customid is missing or malformed");
  }

  return { ok: reasons.length === 0, reasons };
}

