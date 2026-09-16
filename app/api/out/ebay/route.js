import { after, NextResponse } from "next/server";

import {
  ebayActiveLink,
  ebaySoldLink,
  epnCustomId,
  getSeries,
} from "../../../../lib/data";
import { resolveRequestAttribution } from "../../../../lib/campaign-attribution.mjs";
import { buildCustomId, parseAttribution, verticalFromSource } from "../../../../lib/attribution.mjs";
import { recordAffiliateClick } from "../../../../lib/supabase-telemetry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["sold", "active"]);
const VALID_PLACEMENTS = new Set(["series_table"]);

function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  const url = new URL(request.url);
  const seriesSlug = url.searchParams.get("series")?.trim() || "";
  const figureName = url.searchParams.get("figure")?.trim() || "";
  const kind = url.searchParams.get("kind")?.trim() || "";
  const placement = url.searchParams.get("placement")?.trim() || "";
  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer: request.headers.get("referer"),
  });
  const campaignId = requestAttribution.campaignId;
  const outboundSource = requestAttribution.source;
  const rawVertical = url.searchParams.get("vertical")?.trim().toLowerCase() || "";
  const rawItemSlug = url.searchParams.get("itemSlug")?.trim() || figureName;

  if (!VALID_KINDS.has(kind)) return error("Invalid affiliate link type.");
  if (!VALID_PLACEMENTS.has(placement)) return error("Invalid affiliate placement.");

  const series = getSeries(seriesSlug);
  if (!series) return error("Series not found.", 404);
  const figure = series.figures.find(item => item.name === figureName);
  if (!figure) return error("Figure not found.", 404);

  const attribution = parseAttribution({
    vertical: rawVertical || verticalFromSource(outboundSource),
    source: outboundSource,
    itemSlug: rawItemSlug,
  });
  const hasMarketingSource = outboundSource !== "none" && outboundSource !== "page";
  const customId = campaignId || hasMarketingSource
    ? epnCustomId({
        seriesSlug: series.slug,
        figure: figure.name,
        kind,
        placement,
        campaignId,
        source: outboundSource,
      })
    : buildCustomId(attribution);

  const query = `${series.brand} ${series.name} ${figure.name}`;
  const target = kind === "sold" ? ebaySoldLink(query, customId) : ebayActiveLink(query, customId);
  const clickedAt = new Date().toISOString();
  const event = {
    schemaVersion: 4,
    event: "outbound_affiliate_click",
    provider: "ebay_epn",
    clickedAt,
    customId,
    campaignId: campaignId || null,
    campaignSource: campaignId ? outboundSource : null,
    source: hasMarketingSource || campaignId ? outboundSource : attribution.source,
    vertical: attribution.vertical,
    itemSlug: attribution.itemSlug,
    seriesSlug: series.slug,
    seriesName: series.name,
    brand: series.brand,
    figure: figure.name,
    kind,
    placement,
    sourcePath: `/series/${series.slug}`,
    metadata: { attributionRecoveredFrom: requestAttribution.recoveredFrom },
    piiStored: false,
  };

  after(async () => {
    try {
      await recordAffiliateClick(event);
    } catch (cause) {
      console.error("outbound_affiliate_click_log_failed", {
        customId,
        message: cause instanceof Error ? cause.message : "Unknown Supabase error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
