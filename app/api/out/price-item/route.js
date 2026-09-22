import { after, NextResponse } from "next/server";

import { buildEbaySearchUrl } from "../../../../lib/affiliate-policy.mjs";
import { campaignCustomIdSuffix, resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";
import { parsePriceSlug } from "../../../../lib/price-page-core.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const clickQuality = classifyAffiliateRequest(request);
  const url = new URL(request.url);
  const slug = String(url.searchParams.get("slug") || "").trim();
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 180);
  const parsed = parsePriceSlug(slug);
  if (!parsed || query.length < 2) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const attribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const suffix = campaignCustomIdSuffix({ campaignId: attribution.campaignId, source: attribution.source });
  const customId = `price-${parsed.id.slice(0, 48)}${suffix ? `-${suffix}` : ""}`.slice(0, 256);
  const campid = String(process.env.NEXT_PUBLIC_EPN_CAMPID || "").trim();
  const target = buildEbaySearchUrl({ query, kind: "active", customId, campid });
  const clickedAt = new Date().toISOString();

  after(async () => {
    try {
      await recordAffiliateClick({
        schemaVersion: 5,
        event: "outbound_affiliate_click",
        provider: "ebay_epn",
        clickedAt,
        customId,
        campaignId: attribution.campaignId || null,
        campaignSource: attribution.campaignId ? attribution.source : null,
        source: attribution.source !== "none" ? attribution.source : "price_page",
        vertical: "collectibles",
        itemSlug: slug,
        kind: "active",
        placement: "price_page",
        sourcePath: `/price/${slug}`,
        metadata: {
          conditionType: parsed.conditionType,
          attributionRecoveredFrom: attribution.recoveredFrom,
        },
        clientClass: clickQuality.clientClass,
        qualityReason: clickQuality.qualityReason,
        piiStored: false,
      });
    } catch (cause) {
      console.error("price_page_affiliate_click_log_failed", {
        slug: slug.slice(0, 120),
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
