import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import {
  buildAmazonSearchUrl,
  getAmazonAccessoryOffer,
} from "../../../../lib/amazon-associates.mjs";
import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";

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
  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source") || "amazon_accessories");

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
    source,
    offerId: offer.id,
    offerTitle: offer.title,
    placement: "amazon_accessories",
    sourcePath: "/shop/accessories",
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
      console.error("amazon_affiliate_click_log_failed", {
        offerId: offer.id,
        message: cause instanceof Error ? cause.message : "Unknown Blob error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
