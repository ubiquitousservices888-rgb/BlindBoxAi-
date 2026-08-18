import { NextResponse } from "next/server";

import { recordFunnelEvent } from "../../../lib/funnel-event-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: HEADERS }); }

  const email = String(body?.email ?? "").trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400, headers: HEADERS });
  }

  const endpoint = String(process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT ?? "").trim();
  let target;
  try {
    target = new URL(endpoint);
    if (target.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return NextResponse.json({ error: "Waitlist is not configured." }, { status: 503, headers: HEADERS });
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, source: "blindboxai-pro-waitlist" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Waitlist provider did not confirm signup." }, { status: 502, headers: HEADERS });
    }

    try {
      await recordFunnelEvent({
        event: "waitlist_signup",
        status: "observed",
        source: "blindboxai-pro-waitlist",
        path: "/pro",
        providerConfirmed: true,
        emailStored: false,
      });
    } catch (error) {
      console.error("waitlist_signup_log_failed", { name: error?.name });
    }

    return NextResponse.json({ joined: true }, { status: 201, headers: HEADERS });
  } catch (error) {
    console.error("waitlist_provider_request_failed", { name: error?.name });
    return NextResponse.json({ error: "Waitlist provider unavailable." }, { status: 502, headers: HEADERS });
  }
}
