import { epnCronAccessDecision } from "../../../../lib/epn-cron-access.mjs";
import { NextResponse } from "next/server";
import { syncEpnLiveSnapshot } from "../../../../lib/epn-live-sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };
function reply(value, status) {
  return NextResponse.json(value, { status, headers: PRIVATE_HEADERS });
}
export async function GET(request) {
  const decision = epnCronAccessDecision({
    authorization: request.headers.get("authorization"),
    secret: process.env.CRON_SECRET,
    enabled: process.env.EPN_AUTO_SYNC_ENABLED,
  });
  if (decision === "unauthorized") return reply({ error: "Unauthorized" }, 401);
  if (decision === "disabled") {
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
