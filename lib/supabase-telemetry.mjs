const TELEMETRY_PATH = "/functions/v1/distribution-telemetry";

function automatedTestRuntime() {
  return process.env.NODE_ENV === "test" || process.env.CI === "true" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function testIngestAllowed() {
  return String(process.env.BLINDBOXAI_ALLOW_TEST_INGEST || "").trim().toLowerCase() === "true";
}

function config() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const telemetryCode = String(process.env.EVIDENCE_UPLOAD_CODE || "").trim();
  return { url, telemetryCode };
}

async function callTelemetry(payload, { ownerCode = null, fetchImpl = fetch } = {}) {
  const isWrite = payload?.type === "click" || payload?.type === "event";
  if (isWrite && automatedTestRuntime() && !testIngestAllowed()) {
    return { skipped: true, reason: "test_recording_disabled" };
  }

  const { url, telemetryCode } = config();
  if (!url) {
    if (isWrite) return { skipped: true, reason: "supabase_url_missing" };
    throw new Error("SUPABASE_URL is not configured");
  }
  if (!telemetryCode) throw new Error("BlindBoxAI telemetry authorization is not configured");
  const headers = {
    "content-type": "application/json",
    "x-telemetry-authorization": `Bearer ${telemetryCode}`,
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
