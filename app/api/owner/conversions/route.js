import { NextResponse } from "next/server";

import { assertOwnerDashboardCode } from "../../../../lib/owner-auth.mjs";
import { EVENT_STATUS } from "../../../../lib/funnel-events.mjs";
import { recordProviderEvidence } from "../../../../lib/provider-evidence-store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function clean(value, max = 160) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9._:/-]/g, "-").slice(0, max);
}

function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  assertOwnerDashboardCode(token);
}

export async function POST(request) {
  try { authenticate(request); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS }); }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: PRIVATE_HEADERS }); }

  const providerEvidenceId = clean(body?.providerEvidenceId, 160);
  const customId = clean(body?.customId, 180);
  const occurredAt = String(body?.occurredAt ?? "").trim();
  const confirmedRevenueUSD = Number(body?.confirmedRevenueUSD);
  const status = body?.status === EVENT_STATUS.RECONCILED ? EVENT_STATUS.RECONCILED : EVENT_STATUS.PROVIDER_CONFIRMED;

  if (!providerEvidenceId) return NextResponse.json({ error: "Provider evidence ID is required." }, { status: 400, headers: PRIVATE_HEADERS });
  if (!customId) return NextResponse.json({ error: "EPN customid is required for reconciliation." }, { status: 400, headers: PRIVATE_HEADERS });
  if (!occurredAt || !Number.isFinite(new Date(occurredAt).getTime())) {
    return NextResponse.json({ error: "A valid provider transaction timestamp with timezone is required." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!Number.isFinite(confirmedRevenueUSD) || confirmedRevenueUSD < 0) {
    return NextResponse.json({ error: "Confirmed revenue must be a non-negative USD amount from provider evidence." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const recorded = await recordProviderEvidence({
      event: "provider_conversion",
      provider: "ebay_epn",
      status,
      providerEvidenceId,
      customId,
      confirmedRevenueUSD,
      occurredAt: new Date(occurredAt).toISOString(),
      evidenceSource: "owner_entered_provider_report",
      evidenceVerifiedBy: "owner",
      estimate: false,
    });
    return NextResponse.json({ accepted: true, pathname: recorded.pathname }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    const message = String(error?.message || "");
    if (/already|exist|conflict|overwrite/i.test(message)) {
      return NextResponse.json({ error: "This provider evidence ID is already recorded." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    console.error("provider_conversion_record_failed", { name: error?.name });
    return NextResponse.json({ error: "Provider evidence could not be recorded." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
