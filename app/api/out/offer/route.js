import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import { buildEbaySearchUrl } from "../../../../lib/affiliate-policy.mjs";
import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import {
  getRevenueOffer,
  revenueOfferCustomId,
} from "../../../../lib/revenue-offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const offerId = url.searchParams.get("offer")?.trim().toLowerCase() || "";
  const kind = url.searchParams.get("kind")?.trim() || "";
  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "buy_or_pass");

  if (kind !== "active" && kind !== "sold") return error("Invalid affiliate link type.");

  const offer = getRevenueOffer(offerId);
  if (!offer) return error("Offer not found.", 404);

  const customId = revenueOfferCustomId(offer, kind, { campaignId, source });
  const target = buildEbaySearchUrl({
    query: offer.searchQuery,
    kind,
    customId,
    campid: process.env.NEXT_PUBLIC_EPN_CAMPID,
  });

  const clickedAt = new Date().toISOString();
  const event = {
    schemaVersion: 4,
    event: "outbound_affiliate_click",
    provider: "ebay_epn",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    source,
    offerId: offer.id,
    seriesSlug: offer.seriesSlug,
    seriesName: offer.seriesName,
    brand: offer.brand,
    figure: offer.figure,
    kind,
    placement: "buy_or_pass",
    sourcePath: `/tools/buy-or-pass/${offer.id}`,
    piiStored: false,
  };

  after(async () => {
    try {
      const date = clickedAt.slice(0, 10);
      const eventId = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`;
      await put(
        `affiliate/clicks/${date}/${eventId}.json`,
        JSON.stringify(event, null, 2),
        {
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: false,
        },
      );
    } catch (cause) {
      console.error("buy_or_pass_affiliate_click_log_failed", {
        offerId: offer.id,
        customId,
        message: cause instanceof Error ? cause.message : "Unknown Blob error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
