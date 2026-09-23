import { after, NextResponse } from "next/server";

import { getAmazonAccessoryOffer } from "../../../../lib/amazon-associates.mjs";
import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";
import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "no-store" };

export function classifyAmazonBeaconRequest(request, classifier = classifyAffiliateRequest) {
  try {
    const result = classifier(request);
    if (
      !result ||
      typeof result.clientClass !== "string" ||
      typeof result.qualityReason !== "string" ||
      !result.clientClass ||
      !result.qualityReason
    ) {
      throw new Error("Invalid affiliate click classification");
    }
    return result;
  } catch {
    return { clientClass: "unclassified", qualityReason: "classifier_error" };
  }
}

export async function handleAmazonAffiliateClick(request, {
  classifier = classifyAffiliateRequest,
  recorder = recordAffiliateClick,
  defer = after,
  now = () => new Date(),
} = {}) {
  const clickQuality = classifyAmazonBeaconRequest(request, classifier);
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid click payload." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const offerId = String(body?.offerId || "").trim().toLowerCase();
  const offer = getAmazonAccessoryOffer(offerId);
  if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404, headers: PRIVATE_HEADERS });

  const campaignId = normalizeCampaignId(body?.campaignId);
  const source = normalizeSource(body?.source || "amazon_accessories");
  const clickedAt = now().toISOString();
  const customId = ["amazon", offer.id, source, campaignId || "none"].join(":");
  const event = {
    schemaVersion: 5,
    event: "outbound_affiliate_click",
    provider: "amazon_associates",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    source,
    itemSlug: offer.id,
    placement: "amazon_accessories",
    sourcePath: "/shop/accessories",
    metadata: { offerTitle: offer.title, directProviderLink: true },
    clientClass: clickQuality.clientClass,
    qualityReason: clickQuality.qualityReason,
    piiStored: false,
  };

  defer(async () => {
    try {
      await recorder(event);
    } catch (cause) {
      console.error("amazon_affiliate_click_log_failed", {
        offerId: offer.id,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return new NextResponse(null, { status: 204, headers: PRIVATE_HEADERS });
}

export async function POST(request) {
  return handleAmazonAffiliateClick(request);
}
