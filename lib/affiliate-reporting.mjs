function clean(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function providerFor(event = {}) {
  if (event.provider) return clean(event.provider);
  if (event.customId || event.contextType || event.contextId || event.itemId) return "ebay_epn";
  return "unknown";
}

function liveContextId(event = {}) {
  const contextType = clean(event.contextType);
  const contextId = clean(event.contextId);
  const itemId = clean(event.itemId);

  if (contextType || contextId || itemId) {
    return [contextType || "context", contextId || "none", itemId || "none"].join(":");
  }

  return "";
}

export function affiliateRollupKey(event = {}) {
  const provider = providerFor(event);

  if (event.customId) {
    return `${provider}:custom:${clean(event.customId)}`;
  }

  const offerId = clean(
    event.offerId,
    liveContextId(event) || clean(event.placement, clean(event.sourcePath, "unknown")),
  );
  const source = clean(event.source, "direct");
  const campaignId = clean(event.campaignId, "none");
  return `${provider}:offer:${offerId}:source:${source}:campaign:${campaignId}`;
}

export function affiliateReportRow(event = {}) {
  return {
    provider: providerFor(event),
    customId: clean(event.customId),
    offerId: clean(
      event.offerId,
      liveContextId(event) || clean(event.placement, clean(event.sourcePath)),
    ),
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
