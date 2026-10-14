import { OFFICIAL_COLLECTION_URL } from "./official-product-research.mjs";
import { assertBlindBoxSupabaseOrigin, BLINDBOXAI_SUPABASE_ORIGIN } from "./blindbox-supabase-boundary.mjs";

const STOPWORDS = new Set(["a","an","and","are","as","at","be","by","card","cards","collectible","collectibles","for","from","how","i","in","is","it","of","on","or","price","the","this","to","value","what","when","where","which","who","why","with","worth"]);

function clean(value, max = 700) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedTokens(value) {
  return clean(value, 1200)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function queryTokens(value) {
  return [...new Set(normalizedTokens(clean(value, 120)).filter((token) => !STOPWORDS.has(token)))];
}

function scoreFinding(finding, tokens) {
  if (!tokens.length) return 0;
  const haystackTokens = new Set(normalizedTokens(`${clean(finding?.title, 220)} ${clean(finding?.summary, 700)} ${clean(finding?.topic, 120)}`));
  let score = 0;
  for (const token of tokens) if (haystackTokens.has(token)) score += token.length >= 6 ? 3 : 1;
  return score;
}

function sanitizeFinding(finding) {
  const url = clean(finding?.url, 600);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  return {
    title: clean(finding?.title, 220) || "Public research source",
    summary: clean(finding?.summary, 500),
    source: clean(finding?.source, 120),
    topic: clean(finding?.topic, 120),
    url,
    published: clean(finding?.published, 80) || null,
    ...(url === OFFICIAL_COLLECTION_URL && finding?.evidenceType === "official-product" && finding?.verificationStatus === "source-matched" ? { evidenceType: "official-product", verificationStatus: "source-matched" } : {}),
  };
}

export async function searchRecentPublicResearch(query, {
  supabaseUrl = process.env.SUPABASE_URL || BLINDBOXAI_SUPABASE_ORIGIN,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl = fetch,
  runLimit = 8,
  resultLimit = 8,
} = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) return { matches: [], runsSearched: 0, findingsSearched: 0, latestResearchedAt: null, queryStatus: "no-search-terms" };

  const base = assertBlindBoxSupabaseOrigin(supabaseUrl);
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side public research lookup");

  const endpoint = new URL("/rest/v1/mr_know_it_all_public_research_runs", base);
  endpoint.searchParams.set("select", "researched_at,finding_count,source_count,artifact");
  endpoint.searchParams.set("order", "researched_at.desc");
  endpoint.searchParams.set("limit", String(Math.max(1, Math.min(20, Number(runLimit) || 8))));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new Error("Public research lookup failed");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Public research lookup failed with status ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Public research lookup returned an invalid row set");
  const ranked = [];
  let findingsSearched = 0;

  for (const row of rows) {
    const findings = Array.isArray(row?.artifact?.findings) ? row.artifact.findings : [];
    findingsSearched += findings.length;
    for (const raw of findings) {
      const finding = sanitizeFinding(raw);
      if (!finding) continue;
      const score = scoreFinding(finding, tokens);
      if (score > 0) ranked.push({ ...finding, score, researchedAt: clean(row?.researched_at, 80) || null });
    }
  }

  const seen = new Set();
  const matches = ranked
    .sort((a, b) => b.score - a.score || String(b.researchedAt).localeCompare(String(a.researchedAt)))
    .filter((item) => {
      const key = `${item.url.toLowerCase()}|${item.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(12, Number(resultLimit) || 8)))
    .map(({ score, ...item }) => item);

  return {
    matches,
    runsSearched: rows.length,
    findingsSearched,
    latestResearchedAt: rows?.[0]?.researched_at || null,
  };
}
