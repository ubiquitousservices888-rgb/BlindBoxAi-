import crypto from "crypto";

const AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const REVOKE_URL = "https://api.ebay.com/identity/v1/oauth2/token/revoke";
const PROVIDER = "ebay";
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
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

function isConfigured(name) {
  return Boolean(String(process.env[name] || "").trim());
}

export function ownerEbayConfigured() {
  return [
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_REDIRECT_URI",
    "OWNER_INTEGRATION_ENCRYPTION_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].every(isConfigured);
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
  return {
    refreshToken: String(body.refresh_token),
    scopes: String(body.scope || "").split(" ").filter(Boolean),
  };
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

function decryptToken({ encrypted_refresh_token, token_iv, token_tag }) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ownerKey(),
    Buffer.from(String(token_iv || ""), "base64"),
  );
  decipher.setAuthTag(Buffer.from(String(token_tag || ""), "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(String(encrypted_refresh_token || ""), "base64")),
    decipher.final(),
  ]).toString("utf8");
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

async function getStoredEbayIntegration({ includeToken = false } = {}) {
  const fields = includeToken
    ? "provider,encrypted_refresh_token,token_iv,token_tag,scopes,connected_at,updated_at"
    : "provider,scopes,connected_at,updated_at";
  const response = await supabaseRequest(
    `owner_integrations?provider=eq.ebay&select=${fields}`,
    { method: "GET", headers: { Prefer: "" } },
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function ebayOwnerConnectionStatus() {
  const row = await getStoredEbayIntegration();
  return row
    ? {
        connected: true,
        scopes: row.scopes || [],
        connectedAt: row.connected_at,
        updatedAt: row.updated_at,
      }
    : { connected: false };
}

async function revokeEbayRefreshToken(refreshToken) {
  const basic = Buffer.from(`${required("EBAY_CLIENT_ID")}:${required("EBAY_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`eBay token revocation failed (${response.status})`);
  }
}

export async function disconnectEbayOwner() {
  const row = await getStoredEbayIntegration({ includeToken: true });
  if (!row) return;
  const refreshToken = decryptToken(row);
  await revokeEbayRefreshToken(refreshToken);
  await supabaseRequest("owner_integrations?provider=eq.ebay", { method: "DELETE" });
}

export { SCOPES };
