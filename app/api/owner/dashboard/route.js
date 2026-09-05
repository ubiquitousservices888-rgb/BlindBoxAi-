import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { getOwnerDashboardSnapshot } from "../../../../lib/owner-dashboard";
import { requestEtagMatches } from "../../../../lib/owner-dashboard-core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};
const DASHBOARD_BLOB_CACHE_MS = 5 * 60 * 1000;

let cachedDashboard = null;
let cachedDashboardAt = 0;

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: PRIVATE_HEADERS },
  );
}

async function dashboardResult(ifNoneMatch) {
  const now = Date.now();
  if (!cachedDashboard || now - cachedDashboardAt >= DASHBOARD_BLOB_CACHE_MS) {
    // Keep a complete short-lived snapshot in the warm function instance so the
    // dashboard's frequent polling does not repeatedly list and read Blob objects.
    const fresh = await getOwnerDashboardSnapshot({ ifNoneMatch: "" });
    cachedDashboard = fresh;
    cachedDashboardAt = now;
  }

  if (ifNoneMatch && requestEtagMatches(ifNoneMatch, cachedDashboard.etag)) {
    return { etag: cachedDashboard.etag, notModified: true, snapshot: null };
  }

  return cachedDashboard;
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    assertUploadCode(token);
  } catch {
    return unauthorized();
  }

  try {
    const result = await dashboardResult(request.headers.get("if-none-match") || "");
    const headers = { ...PRIVATE_HEADERS, ETag: result.etag };

    if (result.notModified) {
      return new NextResponse(null, { status: 304, headers });
    }

    return NextResponse.json(result.snapshot, { headers });
  } catch (error) {
    console.error("owner_dashboard_load_failed", {
      message: error instanceof Error ? error.message : "Unknown dashboard error",
    });
    return NextResponse.json(
      { error: "Dashboard data unavailable." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}
