export const MAX_DAILY_BROWSE_CALLS = 500;
export const FLAG_TTL_MS = 6 * 60 * 60 * 1000;

export function titleHasIdentifier(title, identifier) {
  const safe = String(identifier || "").replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  if (!safe) return false;
  const patterns = [
    new RegExp(\`#\\s*\${safe}(?!\\d)\`, "i"),
    new RegExp(\`(^|[^0-9])\${safe}\\s*\\/\`, "i"),
    new RegExp(\`(^|[^0-9])\${safe}(?![0-9])\`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(String(title || "")));
}

export function flagIdentifierMismatch(item, listing) {
  const title = String(listing?.title || "");
  const expected = String(item?.expectedIdentifier || "");
  if (!title || !expected) return null;
  if (titleHasIdentifier(title, expected)) return null;
  const conflict = (item?.conflictingIdentifiers || []).find((id) => titleHasIdentifier(title, id));
  if (!conflict) return null;
  return {
    watchItemId: String(item.id),
    listingId: String(listing.itemId || ""),
    title: title.slice(0, 300),
    price: Number.isFinite(Number(listing?.price?.value)) ? Number(listing.price.value) : null,
    currency: String(listing?.price?.currency || "USD").slice(0, 8),
    reason: \`identifier_mismatch: expected \${expected}; found \${conflict}\`,
  };
}

export function assertCallBudget(watchlist, max = MAX_DAILY_BROWSE_CALLS) {
  const calls = Array.isArray(watchlist) ? watchlist.length : 0;
  if (calls > max) throw new Error(\`Browse call budget exceeded: \${calls} > \${max}\`);
  return calls;
}
