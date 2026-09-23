import { after, NextResponse } from "next/server";

import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import {
  getEbayProductionItem,
  normalizeEbayAffiliateReference,
} from "../../../../lib/ebay-production-api.mjs";
import {
  getOwnerCardListing,
  isEpnGenAiPromotionApproved,
} from "../../../../lib/owner-card-listings.mjs";
import { classifyEbayAffiliateRequest } from "../ebay-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request) {
  const clickQuality = classifyEbayAffiliateRequest(request);
  const url = new URL(request.url);
  const researchTargetId = String(url.searchParams.get("id") || "").trim();
  const listing = getOwnerCardListing(researchTargetId);
  if (!listing || listing.status !== "live") return error("Card listing not found.", 404);

  if (!isEpnGenAiPromotionApproved()) {
    return error("Tracked eBay promotion is not enabled for this card.", 503);
  }

  const attribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });

  const affiliateReferenceId = normalizeEbayAffiliateReference(
    [
      "owner-card",
      listing.researchTargetId,
      attribution.campaignId || "none",
      attribution.source,
    ].join("-"),
  );

  let item;
  try {
    item = await getEbayProductionItem({
      itemId: listing.browseItemId,
      affiliateReferenceId,
    });
  } catch (cause) {
    console.error("owner_card_ebay_lookup_failed", {
      researchTargetId: listing.researchTargetId,
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
    campaignId: attribution.campaignId || null,
    campaignSource: attribution.campaignId ? attribution.source : null,
    source: attribution.source,
    vertical: "sports_card",
    itemSlug: listing.researchTargetId,
    figure: listing.identity?.item || null,
    kind: "active",
    placement: "owner_card",
    sourcePath: `/cards/${listing.researchTargetId}`,
    metadata: {
      researchTargetId: listing.researchTargetId,
      attributionRecoveredFrom: attribution.recoveredFrom,
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
      console.error("owner_card_affiliate_click_log_failed", {
        researchTargetId: listing.researchTargetId,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(item.affiliateUrl, 302);
}
