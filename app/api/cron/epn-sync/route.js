import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { syncEpnLiveSnapshot } from "../../../../lib/epn-live-sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
function reply(value, status) {
  return NextResponse.json(value, { status, headers: PRIVATE_HEADERS });
}
function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "");
  const authorization = String(request.headers.get("authorization") || "");
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || authorization.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}

export async function GET(request) {
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  // Explicit off-by-default gate; never infer activation from credential presence.
  if (process.env.EPN_AUTO_SYNC_ENABLED !== "true") {
    return reply({ error: "EPN auto-sync is disabled pending owner validation" }, 503);
  }
  try {
    return reply(await syncEpnLiveSnapshot(), 200);
  } catch {
    // Fail closed. A failed fetch never overwrites the last valid snapshot.
    return reply({ error: "EPN live sync failed; totals were not updated" }, 502);
  }
}
