import { NextResponse } from "next/server";

import { recordAnalyticsEvent } from "../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value, max = 120) {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^a-zA-Z0-9_./:@+-]/g, "")
    .slice(0, max);
}

function cleanDimension(value, max = 80) {
  const cleaned = cleanText(value, max);
  return cleaned && cleaned !== "none" ? cleaned : null;
}

function normalizedEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function eventFrom(body, event, metadata = undefined) {
  const now = new Date().toISOString();
  const campaign = cleanDimension(body?.campaign);
  return {
    schemaVersion: 1,
    namespace: "production",
    test: false,
    status: "observed",
    event,
    capturedAt: now,
    occurredAt: now,
    path: cleanDimension(body?.path, 140) || "/pro",
    source: cleanDimension(body?.source) || "direct",
    campaign,
    contentId: campaign,
    metadata,
    piiStored: false,
  };
}

async function record(body, event, metadata) {
  try {
    await recordAnalyticsEvent(eventFrom(body, event, metadata));
  } catch (cause) {
    console.error("waitlist_analytics_failed", {
      event,
      message: cause instanceof Error ? cause.message : "unknown",
    });
  }
}

async function storeSignup(row) {
  const base = required("SUPABASE_URL").replace(/\/$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${base}/rest/v1/waitlist_signups?on_conflict=email&select=id`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify(row),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`waitlist_storage_${response.status}`);
  const data = await response.json().catch(() => []);
  return Array.isArray(data) && data.length > 0;
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    await record(body, "waitlist_submit_attempt");
    await record(body, "waitlist_submit_failed", { reason: "invalid_json" });
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  await record(body, "waitlist_submit_attempt");

  if (cleanText(body?.companyWebsite, 120)) {
    await record(body, "waitlist_submit_failed", { reason: "bot_honeypot" });
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const email = normalizedEmail(body?.email);
  if (!email) {
    await record(body, "waitlist_submit_failed", { reason: "invalid_email" });
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const row = {
    email,
    source: cleanDimension(body?.source) || "direct",
    campaign: cleanDimension(body?.campaign),
    utm_source: cleanDimension(body?.utmSource),
    utm_medium: cleanDimension(body?.utmMedium),
    utm_campaign: cleanDimension(body?.utmCampaign),
    utm_content: cleanDimension(body?.utmContent),
    updated_at: new Date().toISOString(),
  };

  let inserted = false;
  try {
    inserted = await storeSignup(row);
  } catch (cause) {
    const reason = cause instanceof Error && /^waitlist_storage_\d+$/.test(cause.message)
      ? cause.message
      : "storage_unavailable";
    await record(body, "waitlist_submit_failed", { reason });
    console.error("waitlist_storage_failed", { reason });
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }

  if (!inserted) {
    await record(body, "waitlist_submit_duplicate", { ownedStorage: true });
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  await record(body, "waitlist_signup", { ownedStorage: true });
  return NextResponse.json({ ok: true, duplicate: false }, { status: 201 });
}
