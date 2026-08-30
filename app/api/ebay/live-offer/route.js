import { NextResponse } from "next/server";

import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import {
  ebayProductionApiConfigured,
  normalizeEbayAffiliateReference,
  searchEbayProductionListings,
} from "../../../../lib/ebay-production-api.mjs";
import { getRevenueOffer } from "../../../../lib/revenue-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function clickPath(itemId, offerId, campaignId, source) {
  const params = new URLSearchParams({
    item: itemId,
    context: "offer",
    id: offerId,
    source,
  });
  if (campaignId) params.set("campaign", campaignId);
  return `/api/out/ebay-live?${params.toString()}`;
}

function publicItems(items, offerId, campaignId, source) {
  return items.map(({ affiliateUrl: _affiliateUrl, ...item }) => ({
    ...item,
    clickPath: clickPath(item.itemId, offerId, campaignId, source),
  }));
}

export async function GET(request) {
  const url = new URL(request.url);
  const offerId = String(url.searchParams.get("offer") || "").trim();
  const offer = getRevenueOffer(offerId);
  if (!offer) return json({ error: "Offer not found" }, 404);
  if (!ebayProductionApiConfigured()) {
    return json({ configured: false, items: [] }, 503);
  }

  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "buy_or_pass");
  const referenceId = normalizeEbayAffiliateReference(
    ["bb-live-offer", offer.id, campaignId, source].filter(Boolean).join("-"),
  );

  try {
    const result = await searchEbayProductionListings({
      query: offer.searchQuery,
      affiliateReferenceId: referenceId,
      limit: 6,
    });
    return json({
      configured: true,
      offer: offer.id,
      total: result.total,
      items: publicItems(result.items, offer.id, campaignId, source),
    });
  } catch (cause) {
    const status = Number(cause?.status || 0);
    const code = cause?.code || "EBAY_API_UNAVAILABLE";
    console.error("ebay_live_offer_lookup_failed", {
      offer: offer.id,
      status: status || null,
      code,
      message: cause instanceof Error ? cause.message : "Unknown eBay API error",
    });

    if (code === "EPN_CAMPAIGN_ID_REQUIRED") {
      return json({ configured: true, campaignRequired: true, errorCode: code, items: [] }, 503);
    }
    if (code === "EBAY_OAUTH_INVALID_CLIENT") {
      return json({ configured: true, credentialsInvalid: true, errorCode: code, items: [] }, 503);
    }
    if (code === "BUY_API_PRODUCTION_ACCESS_REQUIRED") {
      return json({ configured: true, accessRequired: true, errorCode: code, items: [] }, 503);
    }
    return json({ configured: true, errorCode: code, items: [] }, 503);
  }
}
