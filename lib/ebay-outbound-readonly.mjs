import {
  ebayActiveLink,
  ebaySoldLink,
  epnCustomId,
  getSeries,
} from "./data.js";
import { resolveRequestAttribution } from "./campaign-attribution.mjs";
import { buildCustomId, parseAttribution, verticalFromSource } from "./attribution.mjs";

const VALID_KINDS = new Set(["sold", "active"]);
const VALID_PLACEMENTS = new Set(["series_table"]);

export function resolveReadonlyEbayOutboundTarget({
  requestUrl,
  referer = "",
  getSeriesFn = getSeries,
} = {}) {
  const url = new URL(String(requestUrl));
  const seriesSlug = url.searchParams.get("series")?.trim() || "";
  const figureName = url.searchParams.get("figure")?.trim() || "";
  const kind = url.searchParams.get("kind")?.trim() || "";
  const placement = url.searchParams.get("placement")?.trim() || "";
  if (!VALID_KINDS.has(kind)) return { status: 400, target: null };
  if (!VALID_PLACEMENTS.has(placement)) return { status: 400, target: null };

  const requestAttribution = resolveRequestAttribution({
    campaign: url.searchParams.get("campaign"),
    source: url.searchParams.get("source"),
    referer,
  });
  const campaignId = requestAttribution.campaignId;
  const outboundSource = requestAttribution.source;
  const rawVertical = url.searchParams.get("vertical")?.trim().toLowerCase() || "";
  const rawItemSlug = url.searchParams.get("itemSlug")?.trim() || figureName;

  const series = getSeriesFn(seriesSlug);
  if (!series) return { status: 404, target: null };
  const figure = (Array.isArray(series.figures) ? series.figures : []).find((item) => item.name === figureName);
  if (!figure) return { status: 404, target: null };

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
  const target = kind === "sold"
    ? ebaySoldLink(query, customId)
    : ebayActiveLink(query, customId);

  return { status: 302, target };
}
