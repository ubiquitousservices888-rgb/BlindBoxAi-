import fs from "node:fs/promises";
import path from "node:path";
import { fetchCardApiSales, summarizeCardApiSales } from "../lib/the-card-api.mjs";

const ROOT = process.cwd();
const SERIES_DIR = path.join(ROOT, "data", "series");
const OUT_DIR = path.join(ROOT, "data", "know-it-all");
const OUT = path.join(OUT_DIR, "latest-transaction-verification.json");
const SPORTS_CARD_TARGETS = path.join(OUT_DIR, "sports-card-research-targets.json");
const MAX_SEARCH_BYTES = 1_500_000;
const MAX_PAGE_BYTES = 2_500_000;
const MAX_RESULTS_PER_QUERY = 8;
const MIN_CONFIRMED_SALES = 2;
const USER_AGENT = "BlindBoxAI-KnowItAll/1.0 (public transaction verification)";

const SECRET_PATTERNS = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/gi,
  /gh[pousr]_[A-Za-z0-9]{20,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/gi,
  /-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gi,
  /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
];

const SOURCES = [
  { name: "Mercari US", domain: "mercari.com", query: (name) => `site:mercari.com/us/item/ \"${name}\" SOLD` },
  { name: "Whatnot", domain: "whatnot.com", query: (name) => `site:whatnot.com/listing/ \"${name}\" sold` },
];

function redact(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED_SECRET]");
  return text;
}

function stripHtml(value) {
  return redact(String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim());
}

function usdValues(text) {
  return [...String(text).matchAll(/\$\s*([0-9]{1,5}(?:,[0-9]{3})?(?:\.\d{1,2})?)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100000);
}

function isConfirmedSold(source, text) {
  const normalized = String(text).toLowerCase();
  if (source === "Mercari US") return /\bsold(?:\s+(?:out|\d+[a-z]+\s+ago))?\b/.test(normalized) && /item sold|sorry, this item has been sold|sold out/.test(normalized);
  return /\bsold\b/.test(normalized) && /sold\s+(?:for|price)|sold price|completed sale/.test(normalized);
}

function candidateUrls(html, domain) {
  const urls = new Set();
  const pattern = /https?:\/\/[^\s"'<>]+/gi;
  for (const raw of html.match(pattern) ?? []) {
    const url = raw.replace(/[),.;]+$/, "");
    try {
      const parsed = new URL(url);
      if (parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)) urls.add(url);
    } catch {}
  }
  return [...urls].filter((url) => domain === "mercari.com" ? /\/us\/item\//.test(url) : /\/listing\//.test(url)).slice(0, MAX_RESULTS_PER_QUERY);
}

async function fetchText(url, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return { ok: false, status: response.status, text: "" };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: "too-large", text: "" };
    return { ok: true, status: response.status, text };
  } catch (error) {
    return { ok: false, status: error?.name === "AbortError" ? "timeout" : "fetch-failed", text: "" };
  } finally { clearTimeout(timer); }
}

async function searchWeb(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
  const result = await fetchText(url, MAX_SEARCH_BYTES);
  if (!result.ok) return { url, status: result.status, urls: [] };
  return { url, status: "ok", urls: candidateUrls(result.text, query.includes("mercari.com") ? "mercari.com" : "whatnot.com") };
}

function extractEvidence(source, url, html, targetName) {
  const text = stripHtml(html);
  if (!isConfirmedSold(source, text)) return null;
  const values = usdValues(text);
  if (!values.length) return null;
  const price = values.find((value) => value > 1) ?? values[0];
  const lower = text.toLowerCase();
  const nameTokens = targetName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const tokenHits = nameTokens.filter((token) => lower.includes(token)).length;
  if (nameTokens.length && tokenHits / nameTokens.length < 0.5) return null;
  return {
    source,
    url,
    observedPriceUSD: price,
    matchedNameTokens: tokenHits,
    nameTokenCount: nameTokens.length,
    evidence: text.slice(0, 900),
    observedAt: new Date().toISOString(),
  };
}

async function loadSeries() {
  const names = await fs.readdir(SERIES_DIR);
  const records = [];
  for (const file of names.filter((name) => name.endsWith(".json") && !name.startsWith("_"))) {
    try {
      const series = JSON.parse(await fs.readFile(path.join(SERIES_DIR, file), "utf8"));
      for (const figure of Array.isArray(series.figures) ? series.figures : []) {
        if (figure?.needsReview !== false) continue;
        records.push({
          slug: series.slug,
          series: series.name,
          brand: series.brand,
          figure: figure.name,
          recordedLowUSD: figure.resaleLow,
          recordedHighUSD: figure.resaleHigh,
          recordedEvidence: figure.evidence ?? null,
        });
      }
    } catch {}
  }
  return records;
}

async function loadSportsCardTargets() {
  const raw = await fs.readFile(SPORTS_CARD_TARGETS, "utf8");
  const registry = JSON.parse(raw);
  if (!Array.isArray(registry?.targets) || registry.targets.length === 0) {
    throw new Error("Sports-card research target registry is missing or empty");
  }
  return registry.targets;
}

const targets = await loadSeries();
const findings = [];
const sourceRuns = [];

for (const target of targets) {
  const targetName = `${target.brand} ${target.series} ${target.figure}`.replace(/\s+/g, " ").trim();
  const targetFindings = [];
  for (const source of SOURCES) {
    const search = await searchWeb(source.query(targetName));
    sourceRuns.push({ source: source.name, target: targetName, searchUrl: search.url, status: search.status, candidateCount: search.urls.length });
    for (const url of search.urls) {
      const page = await fetchText(url, MAX_PAGE_BYTES);
      if (!page.ok) continue;
      const evidence = extractEvidence(source.name, url, page.text, target.figure);
      if (evidence) targetFindings.push(evidence);
    }
  }
  const unique = [...new Map(targetFindings.map((item) => [item.url, item])).values()];
  const confirmed = unique.length >= MIN_CONFIRMED_SALES;
  findings.push({
    ...target,
    verification: confirmed ? "confirmed-by-public-sales-history" : "needs-more-independent-sales",
    minimumEvidenceRequired: MIN_CONFIRMED_SALES,
    confirmedSaleCount: unique.length,
    observedLowUSD: unique.length ? Math.min(...unique.map((item) => item.observedPriceUSD)) : null,
    observedHighUSD: unique.length ? Math.max(...unique.map((item) => item.observedPriceUSD)) : null,
    sales: unique.slice(0, 12),
  });
}

const sportsCardTargets = await loadSportsCardTargets();
const providerCredentialUsed = Boolean(String(process.env.THE_CARD_API_KEY ?? "").trim());
const sportsCardFindings = [];
for (const target of sportsCardTargets) {
  const provider = await fetchCardApiSales(target);
  const verification = summarizeCardApiSales(provider.records, MIN_CONFIRMED_SALES);
  sportsCardFindings.push({
    id: target.id,
    video: target.video,
    claims: target.claims,
    providerStatus: provider.status,
    providerReturnedCount: provider.returnedCount ?? 0,
    providerAcceptedCount: provider.acceptedCount ?? 0,
    verification,
    publicClaimsAllowed: false,
    completedSalePriceSummaryAllowed: verification.canClaimCompletedSalePriceSummary,
    verifiedClaimTypes: verification.canClaimCompletedSalePriceSummary ? ["completed-sale price summary"] : [],
    recommendedVideoMode: verification.status === "VERIFIED"
      ? "VERIFIED_SALES_SUMMARY"
      : "AUDIENCE_PRICE_QUESTION",
    audiencePriceQuestionIsMarketEvidence: false,
    reviewState: "READY_FOR_REVIEW",
  });
  sourceRuns.push({
    source: "The Card API",
    target: target.id,
    status: provider.status,
    returnedCount: provider.returnedCount ?? 0,
    acceptedExactSaleCount: verification.soldSampleCount,
  });
}

const artifact = {
  schema: "blindboxai/know-it-all/transaction-verification/v1",
  agent: "Mr. Know It All",
  mode: providerCredentialUsed ? "public-sales-with-readonly-provider-credential" : "credentialless-public-sales-history",
  researchedAt: new Date().toISOString(),
  security: {
    credentialsProvided: providerCredentialUsed,
    secretsRead: providerCredentialUsed,
    providerCredentialPurpose: providerCredentialUsed ? "read-only completed-sale provider lookup" : null,
    privateRepositoriesAccessed: false,
    sideEffectsPerformed: [],
    ownerApprovalRequiredForCatalogChanges: true,
  },
  policy: {
    onlyPublicHTTPS: true,
    completedOrSoldEvidenceOnly: true,
    askingPricesRejected: true,
    minimumConfirmedExactSales: MIN_CONFIRMED_SALES,
    automaticCatalogOverwrite: false,
    unrelatedClaimsAutoApprovedFromPriceEvidence: false,
  },
  sources: [
    { name: "Mercari US", url: "https://www.mercari.com/", role: "public sold-item evidence" },
    { name: "Whatnot", url: "https://www.whatnot.com/", role: "public marketplace evidence; only explicit sold/completed evidence counts" },
    { name: "The Card API", url: "https://www.thecardapi.com/", role: "read-only sports-card completed-sale provider; confirmed USD prices only" },
  ],
  targetsChecked: targets.length,
  confirmedTargets: findings.filter((item) => item.verification === "confirmed-by-public-sales-history").length,
  findings,
  sportsCardTargetsChecked: sportsCardTargets.length,
  sportsCardFindings,
  sourceRuns,
  nextStep: "Use confirmed evidence as a verification input. Do not overwrite catalog values automatically; preserve owner review for catalog changes.",
};

const serialized = redact(JSON.stringify(artifact, null, 2));
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(OUT, `${serialized}\n`, "utf8");
console.log(`Checked ${targets.length} reviewed figures and ${sportsCardTargets.length} sports-card targets; confirmed ${artifact.confirmedTargets} public-web figures.`);
