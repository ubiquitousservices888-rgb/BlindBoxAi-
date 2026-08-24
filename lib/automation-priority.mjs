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

export function selectPriorityProduct(products, state, { priorityTerms = ["twinkle"] } = {}) {
  const blocked = new Set(
    Object.entries(state?.products ?? {})
      .filter(([, entry]) => ["STAGED", "PARTIAL", "PUBLISHED"].includes(entry?.status))
      .map(([id]) => id),
  );
  const terms = normalizeTerms(priorityTerms);
  return (Array.isArray(products) ? products : [])
    .filter((product) => product?.productId && !blocked.has(product.productId))
    .slice()
    .sort((a, b) => {
      const rankDelta = priorityRank(a, terms) - priorityRank(b, terms);
      if (rankDelta) return rankDelta;
      return String(a.productId).localeCompare(String(b.productId));
    })[0] ?? null;
}
