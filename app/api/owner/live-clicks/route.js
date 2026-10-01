import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import { getDistributionTelemetry } from "../../../../lib/supabase-telemetry.mjs";

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
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  try {
    const telemetry = await getDistributionTelemetry({
      ownerCode,
      lookbackDays: 1,
      recentLimit: 30,
    });
    const byProvider = telemetry?.byProvider || {};
    const recent = Array.isArray(telemetry?.recentClicks) ? telemetry.recentClicks : [];

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowHours: 24,
      totals: {
        ebayEpn: Number(byProvider.ebay_epn || 0) + Number(byProvider.ebay_epn_live || 0),
        amazonAssociates: Number(byProvider.amazon_associates || 0),
        allAffiliate: Number(telemetry?.clicksLoaded || 0),
        qualifiedHuman: Number(telemetry?.funnel?.qualifiedAffiliateClicks || 0),
      },
      recent: recent.map((item) => ({
        id: item.id || item.customId || null,
        provider: item.provider || "unknown",
        clickedAt: item.clickedAt || null,
        figure: item.figure || null,
        seriesName: item.seriesName || null,
        itemSlug: item.itemSlug || null,
        source: item.source || item.campaignSource || null,
        campaignId: item.campaignId || null,
      })),
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("owner_live_clicks_failed", { message: error instanceof Error ? error.message : "Unknown telemetry error" });
    return NextResponse.json({ error: "Live affiliate clicks are temporarily unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
