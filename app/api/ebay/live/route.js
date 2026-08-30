import { NextResponse } from "next/server";

import { getSeries } from "../../../../lib/data";
import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import {
  ebayProductionApiConfigured,
  normalizeEbayAffiliateReference,
  searchEbayProductionListings,
} from "../../../../lib/ebay-production-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function clickPath(itemId, seriesSlug, campaignId, source) {
  const params = new URLSearchParams({
    item: itemId,
    context: "series",
    id: seriesSlug,
    source,
  });
  if (campaignId) params.set("campaign", campaignId);
  return `/api/out/ebay-live?${params.toString()}`;
}

function publicItems(items, seriesSlug, campaignId, source) {
  return items.map(({ affiliateUrl: _affiliateUrl, ...item }) => ({
    ...item,
    clickPath: clickPath(item.itemId, seriesSlug, campaignId, source),
  }));
}

export async function GET(request) {
  const url = new URL(request.url);
  const seriesSlug = String(url.searchParams.get("series") || "").trim();
  const series = getSeries(seriesSlug);

  if (!series) return json({ error: "Series not found" }, 404);
  if (!ebayProductionApiConfigured()) {
    return json({ configured: false, items: [] }, 503);
  }

  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "page");
  const referenceId = normalizeEbayAffiliateReference(
    ["bb-live", series.slug, campaignId, source].filter(Boolean).join("-"),
  );

  try {
    const result = await searchEbayProductionListings({
      query: `${series.brand} ${series.name}`,
      affiliateReferenceId: referenceId,
      limit: 6,
    });

    return json({
      configured: true,
      series: series.slug,
      total: result.total,
      items: publicItems(result.items, series.slug, campaignId, source),
    });
  } catch (cause) {
    const status = Number(cause?.status || 0);
    const code = cause?.code || "EBAY_API_UNAVAILABLE";

    console.error("ebay_live_listing_lookup_failed", {
      series: series.slug,
      status: status || null,
      code,
      message: cause instanceof Error ? cause.message : "Unknown eBay API error",
    });

    if (code === "BUY_API_PRODUCTION_ACCESS_REQUIRED") {
      return json({ configured: true, accessRequired: true, errorCode: code, items: [] }, 503);
    }
    if (code === "EPN_CAMPAIGN_ID_REQUIRED") {
      return json({ configured: true, campaignRequired: true, errorCode: code, items: [] }, 503);
    }
    if (code === "EBAY_OAUTH_INVALID_CLIENT") {
      return json({ configured: true, credentialsInvalid: true, errorCode: code, items: [] }, 503);
    }
    return json({ configured: true, errorCode: code, items: [] }, 503);
  }
}
