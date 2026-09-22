import { after, NextResponse } from "next/server";

import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { getSeries } from "../../../../lib/data";
import { getEbayProductionItem, normalizeEbayAffiliateReference } from "../../../../lib/ebay-production-api.mjs";
import { getRevenueOffer } from "../../../../lib/revenue-offers";
import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function resolveContext(type, id) {
  if (type === "series") {
    const series = getSeries(id);
    return series ? { type, id: series.slug } : null;
  }
  if (type === "offer") {
    const offer = getRevenueOffer(id);
    return offer ? { type, id: offer.id } : null;
  }
  if (type === "ask" && id === "visual-search") {
    return { type: "ask", id: "visual-search" };
  }
  return null;
}

function sourcePathForContext(context) {
  if (context.type === "series") return `/series/${context.id}`;
  if (context.type === "offer") return `/tools/buy-or-pass/${context.id}`;
  if (context.type === "ask") return "/ask";
  return "/";
}

export async function GET(request) {
  const clickQuality = classifyAffiliateRequest(request);
  const url = new URL(request.url);
  const itemId = String(url.searchParams.get("item") || "").trim();
  const context = resolveContext(String(url.searchParams.get("context") || "").trim(), String(url.searchParams.get("id") || "").trim());
  if (!context) return error("Invalid live eBay click context.", 404);

  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const campaignId = requestAttribution.campaignId;
  const source = requestAttribution.source;
  const affiliateReferenceId = normalizeEbayAffiliateReference(
    ["bb-live-click", context.type, context.id, campaignId || "none", source].join("-"),
  );

  let item;
  try {
    item = await getEbayProductionItem({ itemId, affiliateReferenceId });
  } catch (cause) {
    console.error("ebay_live_outbound_lookup_failed", {
      itemId: itemId.slice(0, 180),
      contextType: context.type,
      contextId: context.id,
      code: cause?.code || "EBAY_ITEM_LOOKUP_FAILED",
      status: Number(cause?.status || 0) || null,
    });
    return error("This eBay listing is temporarily unavailable.", 503);
  }

  const clickedAt = new Date().toISOString();
  const event = {
    schemaVersion: 2,
    event: "outbound_affiliate_click",
    provider: "ebay_epn_live",
    clickedAt,
    customId: affiliateReferenceId,
    campaignId: campaignId || null,
    campaignSource: campaignId ? source : null,
    source,
    itemSlug: item.itemId,
    placement: context.type,
    sourcePath: sourcePathForContext(context),
    metadata: {
      contextType: context.type,
      contextId: context.id,
      affiliateReferenceId,
      attributionRecoveredFrom: requestAttribution.recoveredFrom,
      ebayUserDataStored: false,
    },
    clientClass: clickQuality.clientClass,
    qualityReason: clickQuality.qualityReason,
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAffiliateClick(event);
    } catch (cause) {
      console.error("ebay_live_outbound_click_log_failed", {
        itemId: item.itemId,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(item.affiliateUrl, 302);
}
