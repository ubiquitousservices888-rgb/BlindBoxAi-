import { loadVerifiedCompCatalog } from "./deterministic-comp-lookup.mjs";

const ORIGIN = "https://blindboxai.com";

export function summarizePriceFreshness(catalog) {
  const counts = { fresh: 0, dated: 0, unknown: 0 };
  for (const item of catalog) counts[Object.hasOwn(counts, item.freshnessStatus) ? item.freshnessStatus : "unknown"] += 1;
  return { reviewedRecords: catalog.length, ...counts, refreshNeeded: counts.dated + counts.unknown,
    currentPriceClaimAllowed: counts.fresh > 0 };
}

export async function runDailyResearchCheck({ fetchImpl = fetch, now = new Date(),
  catalog = loadVerifiedCompCatalog(undefined, { now }), expectedRevision = "" } = {}) {
  const slugs = [...new Set(catalog.map(item => item.seriesSlug))].filter(slug => /^[a-z0-9-]+$/.test(slug)).slice(0, 12);
  const paths = ["/api/health", "/ask", ...slugs.map(slug => `/series/${slug}`)];
  const pages = [];
  // Sequential, bounded GET-only probes. Never visit affiliate redirects or submit a question.
  for (const path of paths) {
    try {
      const response = await fetchImpl(`${ORIGIN}${path}`, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(10_000), headers: { "user-agent": "BlindBoxAI-daily-read-only-check/1.0" } });
      let status = response.status === 200 ? "ok" : "unavailable";
      let revisionMatches = null;
      if (path === "/api/health" && response.ok) {
        const body = await response.json();
        const valid = body.app === "blindboxai" && body.status === "ok" && /^[a-f0-9]{40}$/.test(body.revision || "");
        revisionMatches = /^[a-f0-9]{40}$/.test(expectedRevision) ? body.revision === expectedRevision : null;
        if (!valid || revisionMatches === false) status = "unavailable";
      } else { await response.body?.cancel(); }
      pages.push({ path, httpStatus: response.status, status, revisionMatches });
    } catch { pages.push({ path, httpStatus: null, status: "unavailable", revisionMatches: null }); }
  }
  return { schema: "blindboxai/daily-research-check/v1", checkedAt: now.toISOString(),
    status: pages.every(page => page.status === "ok") ? "ok" : "attention-needed",
    prices: summarizePriceFreshness(catalog), pages,
    limits: ["Catalog freshness uses documented sale dates, not today's retrieval date.",
      "Stale evidence is reported, never rewritten as current.",
      "No affiliate clicks, customer questions, queue writes, renders, or publications are performed.",
      "Page probes cover at most twelve reviewed series; the EPN audit checks repository affiliate links separately."] };
}
