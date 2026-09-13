import fs from "node:fs";
import path from "node:path";

const DISCLAIMER = "Historical observed resale data only. Not financial or investment advice. Past sales do not guarantee future prices.";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it",
  "most", "of", "on", "or", "release", "releases", "sports", "card", "cards", "that", "the", "this", "to",
  "value", "valuable", "was", "what", "whats", "when", "where", "which", "who", "why", "with", "year", "years",
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function queryTokens(value) {
  return [...new Set(tokens(value).filter((token) => token.length >= 2 && !STOPWORDS.has(token)))];
}

function tokenSet(value) {
  return new Set(tokens(value));
}

function isSportsCardIntent(value) {
  return /\b(?:sports? cards?|baseball cards?|basketball cards?|football cards?|hockey cards?|rookie cards?|topps|panini|bowman)\b/i.test(String(value ?? ""));
}

export function loadVerifiedCompCatalog(seriesDirectory = path.join(process.cwd(), "data", "series")) {
  if (!fs.existsSync(seriesDirectory)) return [];

  const records = [];
  for (const file of fs.readdirSync(seriesDirectory).filter((name) => name.endsWith(".json") && !name.startsWith("_"))) {
    const series = JSON.parse(fs.readFileSync(path.join(seriesDirectory, file), "utf8"));
    for (const figure of Array.isArray(series.figures) ? series.figures : []) {
      if (
        figure?.needsReview !== false ||
        !Number.isFinite(figure?.resaleLow) ||
        !Number.isFinite(figure?.resaleHigh) ||
        figure.resaleLow <= 0 ||
        figure.resaleHigh < figure.resaleLow
      ) continue;

      records.push({
        brand: String(series.brand ?? "").trim(),
        series: String(series.name ?? "").trim(),
        seriesSlug: String(series.slug ?? "").trim(),
        figure: String(figure.name ?? "").trim(),
        rarity: String(figure.rarity ?? "unknown").trim(),
        observedLowUSD: figure.resaleLow,
        observedHighUSD: figure.resaleHigh,
        evidence: String(figure.evidence ?? "").trim(),
        checklist: Array.isArray(series.checklist) ? series.checklist.map((item) => String(item)) : [],
        reviewStatus: "reviewed",
      });
    }
  }
  return records.sort((a, b) => `${a.series} ${a.figure}`.localeCompare(`${b.series} ${b.figure}`));
}

function scoreRecord(record, query) {
  const normalizedQuery = normalize(query);
  const meaningfulTokens = queryTokens(query);
  if (!normalizedQuery || meaningfulTokens.length === 0) return 0;

  const figure = normalize(record.figure);
  const series = normalize(record.series);
  const brand = normalize(record.brand);
  const haystack = `${brand} ${series} ${figure}`;
  const figureTokens = tokenSet(record.figure);
  const seriesTokens = tokenSet(record.series);
  const brandTokens = tokenSet(record.brand);

  let score = 0;
  if (figure === normalizedQuery) score += 100;
  if (series === normalizedQuery) score += 70;
  if (haystack.includes(normalizedQuery)) score += 35;
  for (const token of meaningfulTokens) {
    if (figureTokens.has(token)) score += 12;
    else if (seriesTokens.has(token)) score += 7;
    else if (brandTokens.has(token)) score += 3;
  }
  return score;
}

export function lookupVerifiedComps(query, { catalog, limit = 12 } = {}) {
  const clean = String(query ?? "").trim().slice(0, 120);
  if (clean.length < 2) return [];
  const source = catalog ?? loadVerifiedCompCatalog();
  return source
    .map((record) => ({ record, score: scoreRecord(record, clean) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.record.figure.localeCompare(b.record.figure))
    .slice(0, Math.max(1, Math.min(limit, 25)))
    .map(({ record }) => record);
}

export function buildDeterministicCompResponse(query, options = {}) {
  const matches = lookupVerifiedComps(query, options);
  if (matches.length === 0) {
    const sportsCardMessage = isSportsCardIntent(query)
      ? "No verified sports-card sale found in the reviewed BlindBoxAI dataset for that search."
      : "No verified sale found in the reviewed BlindBoxAI dataset for that search.";
    return {
      answer: sportsCardMessage,
      confidence: "high",
      currentAsOf: null,
      citations: [],
      safetyNotes: [DISCLAIMER, "Only reviewed records are returned. Pending, unrelated, or single-sale records are excluded."],
      suggestedQuestions: [],
      matches: [],
      mode: "deterministic",
    };
  }

  const top = matches[0];
  const range = top.observedLowUSD === top.observedHighUSD
    ? `$${top.observedLowUSD.toFixed(2)}`
    : `$${top.observedLowUSD.toFixed(2)}–$${top.observedHighUSD.toFixed(2)}`;

  return {
    answer: `${top.figure} from ${top.series} has a reviewed historical observed range of ${range}.`,
    confidence: "high",
    currentAsOf: null,
    citations: [],
    safetyNotes: [DISCLAIMER, "Only reviewed local records are used. No generative AI or external model is called."],
    suggestedQuestions: [],
    matches,
    mode: "deterministic",
  };
}
