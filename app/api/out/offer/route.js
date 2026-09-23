import { after, NextResponse } from "next/server";

import { buildEbaySearchUrl } from "../../../../lib/affiliate-policy.mjs";
import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { getRevenueOffer, revenueOfferCustomId } from "../../../../lib/revenue-offers";
import { classifyEbayAffiliateRequest } from "../ebay-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  const clickQuality = classifyEbayAffiliateRequest(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("offer")?.trim().toLowerCase() || "";
  const kind = url.searchParams.get("kind")?.trim() || "";
  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const campaignId = requestAttribution.campaignId;
  const source = requestAttribution.source;

  if (kind !== "active" && kind !== "sold") return error("Invalid affiliate link type.");
  const offer = getRevenueOffer(offerId);
  if (!offer) return error("Offer not found.", 404);

  const customId = revenueOfferCustomId(offer, kind, { campaignId, source });
  const target = buildEbaySearchUrl({ query: offer.searchQuery, kind, customId, campid: process.env.NEXT_PUBLIC_EPN_CAMPID });
  const clickedAt = new Date().toISOString();
  const event = {
    schemaVersion: 4,
    event: "outbound_affiliate_click",
    provider: "ebay_epn",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    campaignSource: campaignId ? source : null,
    source,
    itemSlug: offer.id,
    seriesSlug: offer.seriesSlug,
    seriesName: offer.seriesName,
    brand: offer.brand,
    figure: offer.figure,
    kind,
    placement: "buy_or_pass",
    sourcePath: `/tools/buy-or-pass/${offer.id}`,
    metadata: { attributionRecoveredFrom: requestAttribution.recoveredFrom },
    clientClass: clickQuality.clientClass,
    qualityReason: clickQuality.qualityReason,
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAffiliateClick(event);
    } catch (cause) {
      console.error("buy_or_pass_affiliate_click_log_failed", {
        offerId: offer.id,
        customId,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
