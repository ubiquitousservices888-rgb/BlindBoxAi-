import { isEbayHostname } from "./affiliate-policy.mjs";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item";
const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_MARKETPLACE = "EBAY_US";
const TOKEN_SKEW_MS = 60_000;

let tokenCache = { accessToken: "", expiresAt: 0 };

function envValue(env, name) {
  return String(env?.[name] || "").trim();
}

function ebayError(message, code, status = 0) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

export function ebayProductionApiConfigured(env = process.env) {
  return Boolean(envValue(env, "EBAY_CLIENT_ID") && envValue(env, "EBAY_CLIENT_SECRET"));
}

export function normalizeEbayAffiliateReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 256);
}

function safeEbayAffiliateUrl(value) {
  const affiliateUrl = String(value || "").trim();
  if (!affiliateUrl) return "";
  try {
    const url = new URL(affiliateUrl);
    return url.protocol === "https:" && isEbayHostname(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeEbayBrowseItems(payload) {
  const summaries = Array.isArray(payload?.itemSummaries) ? payload.itemSummaries : [];
  return summaries.map(item => ({
    itemId: String(item?.itemId || ""),
    title: String(item?.title || "").trim(),
    price: String(item?.price?.value || "").trim(),
    currency: String(item?.price?.currency || "USD").trim(),
    condition: String(item?.condition || "").trim(),
    imageUrl: String(item?.image?.imageUrl || "").trim(),
    seller: String(item?.seller?.username || "").trim(),
    affiliateUrl: safeEbayAffiliateUrl(item?.itemAffiliateWebUrl),
  })).filter(item => item.itemId && item.title && item.affiliateUrl);
}

export function normalizeEbayBrowseItem(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = {
    itemId: String(item?.itemId || ""),
    title: String(item?.title || "").trim(),
    price: String(item?.price?.value || "").trim(),
    currency: String(item?.price?.currency || "USD").trim(),
    condition: String(item?.condition || "").trim(),
    imageUrl: String(item?.image?.imageUrl || "").trim(),
    seller: String(item?.seller?.username || "").trim(),
    affiliateUrl: safeEbayAffiliateUrl(item?.itemAffiliateWebUrl),
  };
  return normalized.itemId && normalized.title && normalized.affiliateUrl ? normalized : null;
}

async function readJsonSafe(response) {
  try { return await response.json(); } catch { return null; }
}

async function getApplicationAccessToken(env = process.env, fetchImpl = fetch) {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt - TOKEN_SKEW_MS > now) return tokenCache.accessToken;

  const clientId = envValue(env, "EBAY_CLIENT_ID");
  const clientSecret = envValue(env, "EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw ebayError(
      "eBay Production API credentials are not configured",
      "EBAY_CREDENTIALS_NOT_CONFIGURED",
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: OAUTH_SCOPE }),
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  const accessToken = String(payload?.access_token || "").trim();
  const expiresIn = Number(payload?.expires_in || 0);
  if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw ebayError(
      "eBay OAuth application-token request failed",
      response.status === 401 ? "EBAY_OAUTH_INVALID_CLIENT" : "EBAY_OAUTH_FAILED",
      response.status,
    );
  }
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

function liveApiContext({ env = process.env, affiliateReferenceId = "" } = {}) {
  const campaignId = envValue(env, "EBAY_EPN_CAMPAIGN_ID") || envValue(env, "NEXT_PUBLIC_EPN_CAMPID");
  if (!/^\d{7,12}$/.test(campaignId)) {
    throw ebayError(
      "An EPN campaign ID is required for live eBay listings",
      "EPN_CAMPAIGN_ID_REQUIRED",
    );
  }
  const marketplaceId = envValue(env, "EBAY_MARKETPLACE_ID") || DEFAULT_MARKETPLACE;
  const referenceId = normalizeEbayAffiliateReference(affiliateReferenceId);
  const endUserContext = referenceId
    ? `affiliateCampaignId=${campaignId},affiliateReferenceId=${referenceId}`
    : `affiliateCampaignId=${campaignId}`;
  return { marketplaceId, endUserContext };
}

export async function searchEbayProductionListings({ query, affiliateReferenceId = "", limit = 6, env = process.env, fetchImpl = fetch } = {}) {
  const normalizedQuery = String(query || "").trim().slice(0, 160);
  if (!normalizedQuery) throw new Error("An eBay search query is required");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 6, 12));
  const { marketplaceId, endUserContext } = liveApiContext({ env, affiliateReferenceId });
  const accessToken = await getApplicationAccessToken(env, fetchImpl);

  const url = new URL(BROWSE_SEARCH_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", String(safeLimit));
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      "X-EBAY-C-ENDUSERCTX": endUserContext,
    },
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw ebayError(
      "eBay Browse API search failed",
      response.status === 403 ? "BUY_API_PRODUCTION_ACCESS_REQUIRED" : "EBAY_BROWSE_FAILED",
      response.status,
    );
  }
  return { total: Number(payload?.total || 0), items: normalizeEbayBrowseItems(payload) };
}

export async function getEbayProductionItem({ itemId, affiliateReferenceId = "", env = process.env, fetchImpl = fetch } = {}) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId || normalizedItemId.length > 180 || !/^[A-Za-z0-9|._:-]+$/.test(normalizedItemId)) {
    throw ebayError("A valid eBay item ID is required", "EBAY_ITEM_ID_INVALID");
  }

  const { marketplaceId, endUserContext } = liveApiContext({ env, affiliateReferenceId });
  const accessToken = await getApplicationAccessToken(env, fetchImpl);
  const url = `${BROWSE_ITEM_URL}/${encodeURIComponent(normalizedItemId)}`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      "X-EBAY-C-ENDUSERCTX": endUserContext,
    },
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw ebayError(
      "eBay Browse API item lookup failed",
      response.status === 403 ? "BUY_API_PRODUCTION_ACCESS_REQUIRED" : "EBAY_ITEM_LOOKUP_FAILED",
      response.status,
    );
  }
  const item = normalizeEbayBrowseItem(payload);
  if (!item) throw ebayError("eBay item did not include an affiliate destination", "EBAY_AFFILIATE_URL_REQUIRED");
  return item;
}

export function resetEbayTokenCacheForTests() {
  tokenCache = { accessToken: "", expiresAt: 0 };
}
