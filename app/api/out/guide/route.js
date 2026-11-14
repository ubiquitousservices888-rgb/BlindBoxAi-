import { after, NextResponse } from "next/server";

import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";
import { FAKE_CHECK_GUIDE, normalizeGuidePlacement } from "../../../../lib/fake-check-guide.mjs";
import { recordAnalyticsEvent } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a visitor to BlindBoxAI's own product checkout. The target is a fixed
// constant (never read from the request). The click is logged as a first-party
// analytics event, not an affiliate click, so eBay/Amazon reporting is unchanged.
export async function GET(request) {
  const clickQuality = classifyAffiliateRequest(request);
  const url = new URL(request.url);
  const placement = normalizeGuidePlacement(url.searchParams.get("placement"));
  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const campaignId = requestAttribution.campaignId;
  const source = requestAttribution.source;
  const capturedAt = new Date().toISOString();
  const event = {
    schemaVersion: 1,
    namespace: "production",
    test: false,
    status: "observed",
    event: "own_product_checkout_click",
    capturedAt,
    occurredAt: capturedAt,
    path: FAKE_CHECK_GUIDE.path,
    source,
    destination: "gumroad",
    campaign: campaignId || null,
    contentId: FAKE_CHECK_GUIDE.id,
    metadata: {
      placement,
      attributionRecoveredFrom: requestAttribution.recoveredFrom,
      clientClass: clickQuality.clientClass,
      qualityReason: clickQuality.qualityReason,
    },
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAnalyticsEvent(event);
    } catch (cause) {
      console.error("own_product_checkout_click_log_failed", {
        productId: FAKE_CHECK_GUIDE.id,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(FAKE_CHECK_GUIDE.checkoutUrl, 302);
}
