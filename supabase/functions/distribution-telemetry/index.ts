import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(value: unknown, max = 180) {
  const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

function cleanObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    const safeKey = clean(key, 50);
    if (!safeKey) continue;
    if (typeof item === "boolean" || typeof item === "number" || item === null) result[safeKey] = item;
    else result[safeKey] = clean(item, 240);
  }
  return result;
}

function clientKey(req: Request) {
  return clean(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("user-agent") || "anonymous", 120) || "anonymous";
}

function requestRateAllowed(req: Request) {
  const now = Date.now();
  const key = clientKey(req);
  const current = requestBuckets.get(key);
  if (!current || now >= current.resetAt) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  if (requestBuckets.size > 2_000) {
    for (const [bucketKey, value] of requestBuckets) {
      if (now >= value.resetAt) requestBuckets.delete(bucketKey);
    }
  }
  return current.count <= 60;
}

async function validateBlindBoxAuthorization(headerValue: string, path = "/api/owner/storage-auth") {
  if (!headerValue.startsWith("Bearer ")) return false;
  try {
    const response = await fetch(`https://www.blindboxai.com${path}`, {
      method: "POST",
      headers: { Authorization: headerValue },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function requestAuthorized(req: Request) {
  return validateBlindBoxAuthorization(req.headers.get("x-telemetry-authorization") || "");
}

async function ownerAuthorized(req: Request) {
  return validateBlindBoxAuthorization(
    req.headers.get("x-owner-authorization") || "",
    "/api/owner/control-auth",
  );
}

async function recordClick(body: any) {
  const provider = clean(body?.provider, 40);
  const clickedAt = clean(body?.clickedAt, 40);
  if (!provider || !clickedAt || !Number.isFinite(Date.parse(clickedAt))) return json({ error: "Invalid click event" }, 400);
  const row = {
    clicked_at: clickedAt,
    provider,
    custom_id: clean(body?.customId, 220),
    campaign_id: clean(body?.campaignId, 120),
    campaign_source: clean(body?.campaignSource, 80),
    source: clean(body?.source, 80),
    vertical: clean(body?.vertical, 40),
    item_slug: clean(body?.itemSlug, 160),
    series_slug: clean(body?.seriesSlug, 160),
    series_name: clean(body?.seriesName, 180),
    brand: clean(body?.brand, 120),
    figure: clean(body?.figure, 180),
    kind: clean(body?.kind, 40),
    placement: clean(body?.placement, 80),
    source_path: clean(body?.sourcePath, 220),
    destination: clean(body?.destination, 180),
    metadata: cleanObject(body?.metadata),
    pii_stored: false,
  };
  const { error } = await db.from("affiliate_clicks").insert(row);
  if (error) {
    console.error("affiliate_click_insert_failed", { code: error.code });
    return json({ error: "Unable to store click" }, 500);
  }
  return json({ ok: true }, 202);
}

async function recordEvent(body: any) {
  const eventName = clean(body?.event, 50);
  const capturedAt = clean(body?.capturedAt, 40);
  if (!eventName || !capturedAt || !Number.isFinite(Date.parse(capturedAt))) return json({ error: "Invalid analytics event" }, 400);
  const row = {
    captured_at: capturedAt,
    event_name: eventName,
    path: clean(body?.path, 220),
    source: clean(body?.source, 80),
    destination: clean(body?.destination, 80),
    campaign: clean(body?.campaign, 120),
    content_id: clean(body?.contentId, 120),
    vertical: clean(body?.vertical, 40),
    namespace: clean(body?.namespace, 40) || "production",
    status: clean(body?.status, 40) || "observed",
    metadata: cleanObject(body?.metadata),
    pii_stored: false,
  };
  const { error } = await db.from("analytics_events").insert(row);
  if (error) {
    console.error("analytics_event_insert_failed", { code: error.code });
    return json({ error: "Unable to store event" }, 500);
  }
  return json({ ok: true }, 202);
}

async function recordProviderEvidence(req: Request, body: any) {
  if (!await ownerAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const evidence = Array.isArray(body?.evidence) ? body.evidence.slice(0, 100) : [];
  if (!evidence.length) return json({ ok: true, inserted: 0, duplicates: 0 });

  const observedAt = new Date().toISOString();
  const rows = [];
  for (const item of evidence) {
    const providerEvidenceId = clean(item?.providerEvidenceId, 180);
    const rawRevenue = Number(item?.confirmedRevenueUSD);
    const occurredAt = clean(item?.occurredAt, 40);
    if (!providerEvidenceId || !Number.isFinite(rawRevenue) || rawRevenue < 0 || rawRevenue > 100000000) {
      return json({ error: "Invalid provider evidence" }, 400);
    }
    if (occurredAt && !Number.isFinite(Date.parse(occurredAt))) {
      return json({ error: "Invalid provider evidence timestamp" }, 400);
    }
    rows.push({
      provider: "ebay_epn",
      provider_evidence_id: providerEvidenceId,
      custom_id: clean(item?.customId, 220),
      occurred_at: occurredAt || null,
      observed_at: observedAt,
      confirmed_revenue_usd: Math.round(rawRevenue * 100) / 100,
      status: "provider_confirmed",
      source: "ebay_partner_network_csv",
      metadata: {},
    });
  }

  const { data, error } = await db.from("provider_conversion_evidence")
    .upsert(rows, { onConflict: "provider,provider_evidence_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("provider_evidence_insert_failed", { code: error.code });
    return json({ error: "Unable to store provider evidence" }, 500);
  }
  const inserted = Array.isArray(data) ? data.length : 0;
  return json({ ok: true, inserted, duplicates: rows.length - inserted }, 202);
}

async function dashboard(req: Request, body: any) {
  if (!await ownerAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const lookbackDays = Math.max(1, Math.min(90, Number(body?.lookbackDays) || 30));
  const recentLimit = Math.max(1, Math.min(100, Number(body?.recentLimit) || 40));
  const { data, error } = await db.rpc("owner_telemetry_snapshot", {
    p_now: new Date().toISOString(),
    p_lookback_days: lookbackDays,
    p_recent_limit: recentLimit,
  });
  if (error) {
    console.error("owner_telemetry_snapshot_failed", { code: error.code });
    return json({ error: "Unable to load telemetry" }, 500);
  }
  return json({ ok: true, snapshot: data });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON required" }, 415);
  if (!requestRateAllowed(req)) return json({ error: "Rate limit exceeded" }, 429);
  if (!await requestAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const type = clean(body?.type, 30);
  if (type === "click") return recordClick(body?.event || {});
  if (type === "event") return recordEvent(body?.event || {});
  if (type === "provider_evidence") return recordProviderEvidence(req, body);
  if (type === "dashboard") return dashboard(req, body);
  return json({ error: "Unknown telemetry type" }, 400);
});
