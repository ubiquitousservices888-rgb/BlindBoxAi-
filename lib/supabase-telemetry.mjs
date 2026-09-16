const DEFAULT_SUPABASE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co";
const TELEMETRY_PATH = "/functions/v1/distribution-telemetry";

function config() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

async function callTelemetry(payload, { ownerCode = null, fetchImpl = fetch } = {}) {
  const { url, anonKey } = config();
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is not configured");
  const headers = {
    authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "content-type": "application/json",
  };
  if (ownerCode) headers["x-owner-authorization"] = `Bearer ${ownerCode}`;
  const response = await fetchImpl(`${url}${TELEMETRY_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "error",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Telemetry request failed (${response.status})`);
  return body;
}

export async function recordAffiliateClick(event, options = {}) {
  return callTelemetry({ type: "click", event }, options);
}

export async function recordAnalyticsEvent(event, options = {}) {
  return callTelemetry({ type: "event", event }, options);
}

export async function getDistributionTelemetry({ ownerCode, lookbackDays = 30, recentLimit = 40, fetchImpl = fetch } = {}) {
  if (!ownerCode) throw new Error("Owner authorization is required");
  const body = await callTelemetry({ type: "dashboard", lookbackDays, recentLimit }, { ownerCode, fetchImpl });
  return body?.snapshot || null;
}
