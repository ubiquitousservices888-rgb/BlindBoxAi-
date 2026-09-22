import { after, NextResponse } from "next/server";

import {
  buildAmazonSearchUrl,
  getAmazonAccessoryOffer,
} from "../../../../lib/amazon-associates.mjs";
import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  const clickQuality = classifyAffiliateRequest(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("offer")?.trim().toLowerCase() || "";
  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const campaignId = requestAttribution.campaignId;
  const source = requestAttribution.source;

  const offer = getAmazonAccessoryOffer(offerId);
  if (!offer) return error("Offer not found.", 404);

  const target = buildAmazonSearchUrl(offer.id);
  const clickedAt = new Date().toISOString();
  const customId = ["amazon", offer.id, source, campaignId || "none"].join(":");
  const event = {
    schemaVersion: 4,
    event: "outbound_affiliate_click",
    provider: "amazon_associates",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    campaignSource: campaignId ? source : null,
    source,
    itemSlug: offer.id,
    placement: "amazon_accessories",
    sourcePath: "/shop/accessories",
    metadata: {
      offerTitle: offer.title,
      attributionRecoveredFrom: requestAttribution.recoveredFrom,
    },
    clientClass: clickQuality.clientClass,
    qualityReason: clickQuality.qualityReason,
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAffiliateClick(event);
    } catch (cause) {
      console.error("amazon_affiliate_click_log_failed", {
        offerId: offer.id,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
