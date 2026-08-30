import { isEbayHostname } from "./affiliate-policy.mjs";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_MARKETPLACE = "EBAY_US";
const TOKEN_SKEW_MS = 60_000;

let tokenCache = { accessToken: "", expiresAt: 0 };

function envValue(env, name) {
  return String(env?.[name] || "").trim();
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

export function normalizeEbayBrowseItems(payload) {
  const summaries = Array.isArray(payload?.itemSummaries) ? payload.itemSummaries : [];
  return summaries.map(item => {
    const affiliateUrl = String(item?.itemAffiliateWebUrl || "").trim();
    let safeAffiliateUrl = "";
    if (affiliateUrl) {
      try {
        const url = new URL(affiliateUrl);
        if (url.protocol === "https:" && isEbayHostname(url.hostname)) safeAffiliateUrl = url.toString();
      } catch {}
    }
    return {
      itemId: String(item?.itemId || ""),
      title: String(item?.title || "").trim(),
      price: String(item?.price?.value || "").trim(),
      currency: String(item?.price?.currency || "USD").trim(),
      condition: String(item?.condition || "").trim(),
      imageUrl: String(item?.image?.imageUrl || "").trim(),
      seller: String(item?.seller?.username || "").trim(),
      affiliateUrl: safeAffiliateUrl,
    };
  }).filter(item => item.itemId && item.title && item.affiliateUrl);
}

async function readJsonSafe(response) {
  try { return await response.json(); } catch { return null; }
}

async function getApplicationAccessToken(env = process.env, fetchImpl = fetch) {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt - TOKEN_SKEW_MS > now) return tokenCache.accessToken;

  const clientId = envValue(env, "EBAY_CLIENT_ID");
  const clientSecret = envValue(env, "EBAY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("eBay Production API credentials are not configured");

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
    const error = new Error("eBay OAuth application-token request failed");
    error.status = response.status;
    throw error;
  }
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export async function searchEbayProductionListings({ query, affiliateReferenceId = "", limit = 6, env = process.env, fetchImpl = fetch } = {}) {
  const normalizedQuery = String(query || "").trim().slice(0, 160);
  if (!normalizedQuery) throw new Error("An eBay search query is required");

  const campaignId = envValue(env, "EBAY_EPN_CAMPAIGN_ID") || envValue(env, "NEXT_PUBLIC_EPN_CAMPID");
  if (!/^\d{7,12}$/.test(campaignId)) throw new Error("An EPN campaign ID is required for live eBay listings");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 6, 12));
  const marketplaceId = envValue(env, "EBAY_MARKETPLACE_ID") || DEFAULT_MARKETPLACE;
  const referenceId = normalizeEbayAffiliateReference(affiliateReferenceId);
  const accessToken = await getApplicationAccessToken(env, fetchImpl);

  const url = new URL(BROWSE_SEARCH_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", String(safeLimit));
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");

  const endUserContext = referenceId
    ? `affiliateCampaignId=${campaignId},affiliateReferenceId=${referenceId}`
    : `affiliateCampaignId=${campaignId}`;

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
    const error = new Error("eBay Browse API search failed");
    error.status = response.status;
    if (response.status === 403) error.code = "BUY_API_PRODUCTION_ACCESS_REQUIRED";
    throw error;
  }
  return { total: Number(payload?.total || 0), items: normalizeEbayBrowseItems(payload) };
}

export function resetEbayTokenCacheForTests() {
  tokenCache = { accessToken: "", expiresAt: 0 };
}
