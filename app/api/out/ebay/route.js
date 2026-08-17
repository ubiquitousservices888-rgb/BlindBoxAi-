import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import {
  ebayActiveLink,
  ebaySoldLink,
  epnCustomId,
  getSeries,
} from "../../../../lib/data";
import { normalizeCampaignId, normalizeSource } from "../../../../lib/campaign-attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["sold", "active"]);
const VALID_PLACEMENTS = new Set(["series_table"]);

function error(message, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(request) {
  const url = new URL(request.url);

  const seriesSlug = url.searchParams.get("series")?.trim() || "";
  const figureName = url.searchParams.get("figure")?.trim() || "";
  const kind = url.searchParams.get("kind")?.trim() || "";
  const placement = url.searchParams.get("placement")?.trim() || "";
  const campaignId = normalizeCampaignId(url.searchParams.get("campaign"));
  const source = normalizeSource(url.searchParams.get("source"));

  if (!VALID_KINDS.has(kind)) {
    return error("Invalid affiliate link type.");
  }

  if (!VALID_PLACEMENTS.has(placement)) {
    return error("Invalid affiliate placement.");
  }

  const series = getSeries(seriesSlug);

  if (!series) {
    return error("Series not found.", 404);
  }

  const figure = series.figures.find(item => item.name === figureName);

  if (!figure) {
    return error("Figure not found.", 404);
  }

  const customId = epnCustomId({
    seriesSlug: series.slug,
    figure: figure.name,
    kind,
    placement,
    campaignId,
    source,
  });

  const query = `${series.brand} ${series.name} ${figure.name}`;

  const target =
    kind === "sold"
      ? ebaySoldLink(query, customId)
      : ebayActiveLink(query, customId);

  const clickedAt = new Date().toISOString();

  const event = {
    schemaVersion: 3,
    event: "outbound_affiliate_click",
    provider: "ebay_epn",

    clickedAt,
    customId,
    campaignId: campaignId || null,
    source,

    seriesSlug: series.slug,
    seriesName: series.name,
    brand: series.brand,
    figure: figure.name,

    kind,
    placement,
    sourcePath: `/series/${series.slug}`,

    piiStored: false,
  };

  after(async () => {
    try {
      const date = clickedAt.slice(0, 10);

      const eventId =
        Date.now().toString(36) +
        "-" +
        randomUUID().replaceAll("-", "");

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
      console.error("outbound_affiliate_click_log_failed", {
        customId,
        message:
          cause instanceof Error
            ? cause.message
            : "Unknown Blob error",
      });
    }
  });

  return NextResponse.redirect(target, 302);
}
