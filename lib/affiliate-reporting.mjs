function clean(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function affiliateRollupKey(event = {}) {
  const provider = clean(event.provider, event.customId ? "ebay_epn" : "unknown");

  if (event.customId) {
    return `${provider}:custom:${clean(event.customId)}`;
  }

  const offerId = clean(event.offerId, clean(event.placement, clean(event.sourcePath, "unknown")));
  const source = clean(event.source, "direct");
  const campaignId = clean(event.campaignId, "none");
  return `${provider}:offer:${offerId}:source:${source}:campaign:${campaignId}`;
}

export function affiliateReportRow(event = {}) {
  return {
    provider: clean(event.provider, event.customId ? "ebay_epn" : "unknown"),
    customId: clean(event.customId),
    offerId: clean(event.offerId),
    offerTitle: clean(event.offerTitle),
    seriesSlug: clean(event.seriesSlug),
    seriesName: clean(event.seriesName),
    figure: clean(event.figure),
    kind: clean(event.kind),
    placement: clean(event.placement),
    source: clean(event.source, "direct"),
    campaignId: clean(event.campaignId),
    sourcePath: clean(event.sourcePath),
    clickedAt: clean(event.clickedAt),
  };
}
