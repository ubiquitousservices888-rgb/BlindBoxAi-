import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../../lib/evidence";
import {
  epnReportingCredentials,
  fetchEpnPerformanceByDay,
} from "../../../../../lib/epn-reporting-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try { assertUploadCode(ownerCode); } catch { return unauthorized(); }

  const { accountSid, authToken } = epnReportingCredentials();
  if (!accountSid || !authToken) {
    return NextResponse.json(
      {
        error: !accountSid
          ? "EPN Account SID is not configured in Vercel."
          : "EPN reporting access token is not configured in Vercel.",
        setupRequired: true,
      },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const report = await fetchEpnPerformanceByDay({ accountSid, authToken });
    await put("owner/epn-report/latest.json", JSON.stringify(report, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return NextResponse.json(report, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("epn_api_refresh_failed", {
      message: error instanceof Error ? error.message : "Unknown EPN reporting error",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh EPN reporting." },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
