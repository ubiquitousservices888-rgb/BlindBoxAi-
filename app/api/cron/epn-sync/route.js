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
  const got = Buffer.from(authorization, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (secret.length < 16 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

export async function GET(request) {
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  // Explicit off-by-default gate; never infer activation from credential presence.
  if (process.env.EPN_AUTO_SYNC_ENABLED !== "true") {
    return reply({ error: "EPN auto-sync is disabled pending owner validation" }, 503);
  }
  try {
    return reply(await syncEpnLiveSnapshot(), 200);
  } catch (error) {
    // Log only error category, never provider details, raw data, or secrets.
    console.error("epn_live_sync_failed", { name: String(error?.name || "Error").slice(0, 60) });
    return reply({ error: "EPN live sync failed; totals were not updated" }, 502);
  }
}
