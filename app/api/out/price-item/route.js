import { after, NextResponse } from "next/server";
import { buildEbaySearchUrl } from "../../../../lib/affiliate-policy.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get("slug") || "").trim();
  const query = String(url.searchParams.get("q") || "").trim().slice(0,180);
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || query.length < 2) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400, headers: { "Cache-Control":"no-store" } });
  }
  const campid = String(process.env.NEXT_PUBLIC_EPN_CAMPID || "").trim();
  const customId = `price-page-${slug}`;
  const target = buildEbaySearchUrl({ query, kind: "active", customId, campid });
  const clickedAt = new Date().toISOString();
  after(async () => {
    try {
      await recordAffiliateClick({
        schemaVersion: 4,
        event: "outbound_affiliate_click",
        provider: "ebay_epn",
        clickedAt,
        customId,
        campaignId: null,
        campaignSource: null,
        source: "price_page",
        vertical: "collectibles",
        itemSlug: slug,
        seriesSlug: null,
        seriesName: null,
        brand: null,
        figure: query,
        kind: "active",
        placement: "price_page",
        sourcePath: `/price/${slug}`,
        destination: target,
        metadata: { researchOnly: false },
        piiStored: false,
      });
    } catch {}
  });
  return NextResponse.redirect(target, 302);
}
