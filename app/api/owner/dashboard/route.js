import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { getOwnerDashboardSnapshot } from "../../../../lib/owner-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
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
    const snapshot = await getOwnerDashboardSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("owner_dashboard_load_failed", {
      message: error instanceof Error ? error.message : "Unknown dashboard error",
    });
    return NextResponse.json(
      { error: "Dashboard data unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
