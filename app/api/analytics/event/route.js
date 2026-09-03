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

function badRequest(message) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request) {
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
  const event = {
    schemaVersion: 1,
    event: eventName,
    capturedAt,
    path: cleanText(body?.path, 140) || null,
    source: cleanText(body?.source, 80) || null,
    destination: cleanText(body?.destination, 60) || null,
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
