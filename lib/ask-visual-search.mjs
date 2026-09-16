export function normalizeAskVisualQuery(value) {
  let query = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!query) return "";

  query = query
    .replace(/^what\s+are\s+the\s+/i, "")
    .replace(/^show\s+me\s+/i, "")
    .replace(/^find\s+(?:me\s+)?/i, "")
    .replace(/^top\s+\d+\s+(?:most\s+)?valuable\s+/i, "")
    .replace(/^\d+\s+(?:most\s+)?valuable\s+/i, "")
    .replace(/\s+(?:worth|value|price)\s*\??$/i, "")
    .replace(/[?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return query.slice(0, 100);
}

export function buildAskVisualClickPath(itemId, campaignId = "", source = "ask") {
  const params = new URLSearchParams({
    item: String(itemId ?? "").trim(),
    context: "ask",
    id: "visual-search",
    source: String(source || "ask").trim() || "ask",
  });
  if (campaignId) params.set("campaign", campaignId);
  return `/api/out/ebay-live?${params.toString()}`;
}
