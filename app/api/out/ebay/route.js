import { after, NextResponse } from "next/server";

import { classifyEbayAffiliateRequest } from "../ebay-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";
import { resolveReadonlyEbayOutboundTarget } from "../../../../lib/ebay-outbound-readonly.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

// Read-only validation path for QA. HEAD computes the exact production target
// without recording an affiliate click or following the external redirect.
export async function HEAD(request) {
  const result = resolveReadonlyEbayOutboundTarget({
    requestUrl: request.url,
    referer: request.headers.get("referer") || "",
  });
  if (!result.target) {
    return new Response(null, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: result.target,
    },
  });
}

export async function GET(request) {
  const clickQuality = classifyEbayAffiliateRequest(request);
  const resolved = resolveReadonlyEbayOutboundTarget({
    requestUrl: request.url,
    referer: request.headers.get("referer") || "",
  });
  if (!resolved.target) {
    if (resolved.reason === "invalid-kind") return error("Invalid affiliate link type.");
    if (resolved.reason === "invalid-placement") return error("Invalid affiliate placement.");
    if (resolved.reason === "series-not-found") return error("Series not found.", 404);
    if (resolved.reason === "figure-not-found") return error("Figure not found.", 404);
    return error("Affiliate destination unavailable.", resolved.status || 400);
  }

  const {
    target,
    series,
    figure,
    kind,
    placement,
    requestAttribution,
    campaignId,
    outboundSource,
    attribution,
    hasMarketingSource,
    customId,
  } = resolved;
  const clickedAt = new Date().toISOString();
  const event = {
    schemaVersion: 4,
    event: "outbound_affiliate_click",
    provider: "ebay_epn",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    campaignSource: campaignId ? outboundSource : null,
    source: hasMarketingSource || campaignId ? outboundSource : attribution.source,
    vertical: attribution.vertical,
    itemSlug: attribution.itemSlug,
    seriesSlug: series.slug,
    seriesName: series.name,
    brand: series.brand,
    figure: figure.name,
    kind,
    placement,
    sourcePath: `/series/${series.slug}`,
    metadata: { attributionRecoveredFrom: requestAttribution.recoveredFrom },
    clientClass: clickQuality.clientClass,
    qualityReason: clickQuality.qualityReason,
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAffiliateClick(event);
    } catch (cause) {
      console.error("outbound_affiliate_click_log_failed", {
        customId,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
