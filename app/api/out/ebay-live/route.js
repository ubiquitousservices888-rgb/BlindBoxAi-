import { after, NextResponse } from "next/server";

import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import { getSeries } from "../../../../lib/data";
import { getEbayProductionItem, normalizeEbayAffiliateReference } from "../../../../lib/ebay-production-api.mjs";
import { getRevenueOffer } from "../../../../lib/revenue-offers";
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
  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const itemId = String(url.searchParams.get("item") || "").trim();
  const context = resolveContext(String(url.searchParams.get("context") || "").trim(), String(url.searchParams.get("id") || "").trim());
  if (!context) return error("Invalid live eBay click context.", 404);

  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "live_ebay");
  const affiliateReferenceId = normalizeEbayAffiliateReference(["bb-live-click", context.type, context.id, campaignId, source].filter(Boolean).join("-"));

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
    schemaVersion: 1,
    event: "outbound_affiliate_click",
    provider: "ebay_epn_live",
    clickedAt,
    campaignId: campaignId || null,
    source,
    itemSlug: item.itemId,
    placement: context.type,
    sourcePath: context.type === "series" ? `/series/${context.id}` : `/tools/buy-or-pass/${context.id}`,
    metadata: { contextType: context.type, contextId: context.id, affiliateReferenceId, ebayUserDataStored: false },
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
