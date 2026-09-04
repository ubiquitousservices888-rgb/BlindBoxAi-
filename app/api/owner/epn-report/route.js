import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { parseEpnReportCsv } from "../../../../lib/epn-reporting.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};
const MAX_REPORT_BYTES = 5 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try { assertUploadCode(ownerCode); } catch { return unauthorized(); }

  try {
    const form = await request.formData();
    const file = form.get("report");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an EPN CSV report." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (file.size <= 0 || file.size > MAX_REPORT_BYTES) {
      return NextResponse.json({ error: "EPN report must be between 1 byte and 5 MB." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV reports are accepted." }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const report = parseEpnReportCsv(await file.text());
    await put("owner/epn-report/latest.json", JSON.stringify(report, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return NextResponse.json(report, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import EPN report." },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }
}
