import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "landing_session_source",
  "commerce_intent_click",
]);

function cleanText(value, max = 120) {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^a-zA-Z0-9_./:-]/g, "")
    .slice(0, max);
}

function cleanDimension(value, max = 80) {
  const cleaned = cleanText(value, max);
  return cleaned && cleaned !== "none" ? cleaned : null;
}

function badRequest(message) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return badRequest("Content-Type must be application/json.");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON.");
  }

  const eventName = cleanText(body?.event, 50);
  if (!ALLOWED_EVENTS.has(eventName)) {
    return badRequest("Unsupported analytics event.");
  }

  const capturedAt = new Date().toISOString();
  const campaign = cleanDimension(body?.campaign);
  const event = {
    schemaVersion: 1,
    namespace: "production",
    test: false,
    status: "observed",
    event: eventName,
    capturedAt,
    occurredAt: capturedAt,
    path: cleanDimension(body?.path, 140),
    source: cleanDimension(body?.source),
    destination: cleanDimension(body?.destination, 60),
    campaign,
    contentId: cleanDimension(body?.contentId) || campaign,
    vertical: cleanDimension(body?.vertical, 20),
    piiStored: false,
  };

  try {
    const date = capturedAt.slice(0, 10);
    const eventId = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`;
    await put(
      `analytics/events/${date}/${eventId}.json`,
      JSON.stringify(event, null, 2),
      {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
      },
    );
  } catch (cause) {
    console.error("analytics_event_log_failed", {
      event: eventName,
      message: cause instanceof Error ? cause.message : "Unknown Blob error",
    });
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
