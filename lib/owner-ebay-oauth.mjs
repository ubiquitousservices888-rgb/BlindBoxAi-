import crypto from "crypto";

const AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const PROVIDER = "ebay";
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
];

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function ownerKey() {
  return crypto.createHash("sha256").update(required("OWNER_INTEGRATION_ENCRYPTION_KEY"), "utf8").digest();
}

export function ownerEbayConfigured() {
  return Boolean(
    process.env.EBAY_CLIENT_ID &&
    process.env.EBAY_CLIENT_SECRET &&
    process.env.EBAY_REDIRECT_URI &&
    process.env.OWNER_INTEGRATION_ENCRYPTION_KEY &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function createEbayAuthorizeUrl(state) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", required("EBAY_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("EBAY_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("prompt", "login");
  return url.toString();
}

export async function exchangeEbayCode(code) {
  const basic = Buffer.from(`${required("EBAY_CLIENT_ID")}:${required("EBAY_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: required("EBAY_REDIRECT_URI"),
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.refresh_token) throw new Error("eBay user authorization exchange failed");
  return { refreshToken: String(body.refresh_token), scopes: String(body.scope || "").split(" ").filter(Boolean) };
}

function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ownerKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

async function supabaseRequest(path, init = {}) {
  const base = required("SUPABASE_URL").replace(/\/$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Owner integration storage failed (${response.status})`);
  return response;
}

export async function saveEbayRefreshToken(refreshToken, scopes = []) {
  const sealed = encryptToken(refreshToken);
  await supabaseRequest("owner_integrations?on_conflict=provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      provider: PROVIDER,
      encrypted_refresh_token: sealed.encrypted,
      token_iv: sealed.iv,
      token_tag: sealed.tag,
      scopes,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function ebayOwnerConnectionStatus() {
  const response = await supabaseRequest("owner_integrations?provider=eq.ebay&select=provider,scopes,connected_at,updated_at", {
    method: "GET",
    headers: { Prefer: "" },
  });
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { connected: true, scopes: row.scopes || [], connectedAt: row.connected_at, updatedAt: row.updated_at } : { connected: false };
}

export async function disconnectEbayOwner() {
  await supabaseRequest("owner_integrations?provider=eq.ebay", { method: "DELETE" });
}

export { SCOPES };
