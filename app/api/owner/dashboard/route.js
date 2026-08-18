import { NextResponse } from "next/server";

import { assertOwnerDashboardCode } from "../../../../lib/owner-auth.mjs";
import { getOwnerDashboardSnapshot } from "../../../../lib/owner-dashboard";
import { normalizeLookbackDays } from "../../../../lib/owner-dashboard-core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try { assertOwnerDashboardCode(token); }
  catch { return unauthorized(); }

  try {
    const url = new URL(request.url);
    const lookbackDays = normalizeLookbackDays(Number(url.searchParams.get("days")) || undefined);
    const result = await getOwnerDashboardSnapshot({
      ifNoneMatch: request.headers.get("if-none-match") || "",
      lookbackDays,
    });
    const headers = { ...PRIVATE_HEADERS, ETag: result.etag };
    if (result.notModified) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json(result.snapshot, { headers });
  } catch (error) {
    console.error("owner_dashboard_load_failed", {
      message: error instanceof Error ? error.message : "Unknown dashboard error",
    });
    return NextResponse.json({ error: "Dashboard data unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
