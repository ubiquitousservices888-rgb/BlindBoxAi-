import { after, NextResponse } from "next/server";

import { FUNNEL_EVENTS } from "../../../../lib/funnel-events.mjs";
import { recordFunnelEvent } from "../../../../lib/funnel-event-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_EVENTS = new Set([
  FUNNEL_EVENTS.PAGE_VIEW,
  FUNNEL_EVENTS.LANDING_SESSION_SOURCE,
]);

function clean(value, max = 120) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9._:/-]/g, "-").slice(0, max);
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(request.url).origin]);
  const configured = String(process.env.BLINDBOXAI_SITE_URL ?? "").trim();
  try { if (configured) allowed.add(new URL(configured).origin); } catch { return false; }
  return allowed.has(origin);
}

export async function POST(request) {
  if (!allowedOrigin(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!PUBLIC_EVENTS.has(body?.event)) return NextResponse.json({ error: "Unsupported public funnel event." }, { status: 400 });

  const event = {
    event: body.event,
    status: "observed",
    path: clean(body.path, 120) || null,
    source: clean(body.source, 80) || null,
    medium: clean(body.medium, 80) || null,
    campaign: clean(body.campaign, 120) || null,
    contentId: clean(body.contentId, 120) || null,
    seriesSlug: clean(body.seriesSlug, 120) || null,
  };
  after(async () => {
    try { await recordFunnelEvent(event); }
    catch (error) { console.error("funnel_event_log_failed", { event: event.event, name: error?.name }); }
  });
  return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
