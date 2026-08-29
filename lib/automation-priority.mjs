function normalizeTerms(terms) {
  return (Array.isArray(terms) ? terms : [])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function priorityRank(product, terms) {
  const id = String(product?.productId ?? "").toLowerCase();
  const name = String(product?.name ?? "").toLowerCase();
  const brand = String(product?.brand ?? "").toLowerCase();
  const haystack = `${id} ${name} ${brand}`;
  const termIndex = terms.findIndex((term) => haystack.includes(term));
  if (termIndex >= 0) return termIndex;

  const explicit = Number(product?.automationPriority);
  if (Number.isFinite(explicit)) return 100 + explicit;
  return 10_000;
}

function isAutoPromotable(product) {
  return product?.marketSelection?.autoPromote !== false;
}

export function expireStaleStages(state, { now = new Date(), ttlHours = 48 } = {}) {
  const next = structuredClone(state ?? { products: {} });
  next.products ??= {};
  const expired = [];
  const ttlMs = Math.max(1, Number(ttlHours) || 48) * 60 * 60 * 1000;
  const nowMs = now.getTime();

  for (const [productId, entry] of Object.entries(next.products)) {
    if (entry?.status !== "STAGED") continue;
    const stagedMs = Date.parse(entry.stagedAt ?? "");
    if (!Number.isFinite(stagedMs) || nowMs - stagedMs < ttlMs) continue;
    entry.status = "FAILED";
    entry.failedAt = now.toISOString();
    entry.lastError = `Expired stale STAGED candidate after ${ttlHours}h without approval.`;
    expired.push(productId);
  }

  if (expired.length) next.updatedAt = now.toISOString();
  return { state: next, expired };
}

export function selectPriorityProduct(products, state, { priorityTerms = ["twinkle"] } = {}) {
  const blocked = new Set(
    Object.entries(state?.products ?? {})
      .filter(([, entry]) => ["STAGED", "PARTIAL", "PUBLISHED"].includes(entry?.status))
      .map(([id]) => id),
  );
  const terms = normalizeTerms(priorityTerms);
  return (Array.isArray(products) ? products : [])
    .filter((product) => product?.productId && !blocked.has(product.productId) && isAutoPromotable(product))
    .slice()
    .sort((a, b) => {
      const rankDelta = priorityRank(a, terms) - priorityRank(b, terms);
      if (rankDelta) return rankDelta;
      return String(a.productId).localeCompare(String(b.productId));
    })[0] ?? null;
}
